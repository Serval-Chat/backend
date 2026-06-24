import mongoose, { type Model } from 'mongoose';

import { connectDB } from '@/config/db';
import { SNOWFLAKE_WORKER_ID } from '@/config/env';
import { encodeSnowflakeId, MAX_SEQUENCE } from '@/utils/snowflake';

import { AdminNote } from '@/models/AdminNote';
import { AuditLog } from '@/models/AuditLog';
import { Badge } from '@/models/Badge';
import { Ban } from '@/models/Ban';
import { BlockProfile } from '@/models/BlockProfile';
import { Bot } from '@/models/Bot';
import { DmUnread } from '@/models/DmUnread';
import { Emoji } from '@/models/Emoji';
import { ExportJob } from '@/models/ExportJob';
import { Friendship, FriendRequest } from '@/models/Friendship';
import { KlipyCache } from '@/models/KlipyCache';
import { Message } from '@/models/Message';
import { Mute } from '@/models/Mute';
import { PasswordReset } from '@/models/PasswordReset';
import { Ping } from '@/models/Ping';
import { PushSubscription } from '@/models/PushSubscription';
import { Reaction } from '@/models/Reaction';
import {
    Server,
    ServerVerificationStats,
    Category,
    Channel,
    ServerMember,
    Role,
    Invite,
    ServerMessage,
    ServerBan,
} from '@/models/Server';
import { ServerChannelRead } from '@/models/ServerChannelRead';
import { SlashCommand } from '@/models/SlashCommand';
import { Sticker } from '@/models/Sticker';
import { TotpUsedCode } from '@/models/TotpUsedCode';
import { User } from '@/models/User';
import { UserBlock } from '@/models/UserBlock';
import { UserConnection } from '@/models/UserConnection';
import { Warning } from '@/models/Warning';
import { Webhook } from '@/models/Webhook';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MODELS: Model<any>[] = [
    User,
    Server,
    ServerVerificationStats,
    Category,
    Channel,
    ServerMember,
    Role,
    Invite,
    ServerMessage,
    ServerBan,
    Message,
    Friendship,
    FriendRequest,
    Ban,
    Warning,
    Mute,
    UserBlock,
    BlockProfile,
    AuditLog,
    AdminNote,
    Ping,
    Reaction,
    Bot,
    SlashCommand,
    Emoji,
    Sticker,
    Webhook,
    UserConnection,
    PasswordReset,
    TotpUsedCode,
    DmUnread,
    ServerChannelRead,
    ExportJob,
    PushSubscription,
    KlipyCache,
    Badge,
];

interface MigrationOptions {
    dryRun?: boolean;
    batchSize?: number;
}

interface BackfillDoc {
    _id: mongoose.Types.ObjectId;
    createdAt?: Date;
}

function resolveCreationTimeMs(doc: BackfillDoc): number {
    if (doc.createdAt instanceof Date) {
        return doc.createdAt.getTime();
    }

    return doc._id.getTimestamp().getTime();
}

async function backfillModel(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: Model<any>,
    options: MigrationOptions,
): Promise<number> {
    const collectionName = model.collection.name;
    const batchSize = options.batchSize ?? 500;

    let updated = 0;
    let lastTimestampMs = -1;
    let sequence = 0;

    for (;;) {
        const docs: BackfillDoc[] = await model
            .find({ snowflakeId: { $exists: false } })
            .select({ _id: 1, createdAt: 1 })
            .sort({ _id: 1 })
            .limit(batchSize)
            .lean();

        if (docs.length === 0) {
            break;
        }

        const operations = docs.map((doc) => {
            let timestampMs = resolveCreationTimeMs(doc);

            if (timestampMs < lastTimestampMs) {
                timestampMs = lastTimestampMs;
            }

            if (timestampMs === lastTimestampMs) {
                sequence = (sequence + 1) & MAX_SEQUENCE;
                if (sequence === 0) {
                    timestampMs += 1;
                }
            } else {
                sequence = 0;
            }

            lastTimestampMs = timestampMs;

            const snowflakeId = encodeSnowflakeId(
                timestampMs,
                SNOWFLAKE_WORKER_ID,
                sequence,
            );

            return {
                updateOne: {
                    filter: { _id: doc._id },
                    update: { $set: { snowflakeId } },
                },
            };
        });

        if (options.dryRun === true) {
            console.log(
                `[dry-run] ${collectionName}: would backfill ${operations.length} document(s)`,
            );
        } else {
            await model.collection.bulkWrite(operations, { ordered: false });
        }

        updated += docs.length;

        if (docs.length < batchSize) {
            break;
        }
    }

    console.log(
        `${options.dryRun === true ? '[dry-run] Would backfill' : 'Backfilled'} ${updated} document(s) in ${collectionName}`,
    );

    return updated;
}

export async function up(options: MigrationOptions = {}): Promise<void> {
    let total = 0;
    for (const model of MODELS) {
        total += await backfillModel(model, options);
    }
    console.log(
        `${options.dryRun === true ? '[dry-run] Total' : 'Total'} documents backfilled: ${total}`,
    );
}

export async function down(options: MigrationOptions = {}): Promise<void> {
    for (const model of MODELS) {
        const collectionName = model.collection.name;

        if (options.dryRun === true) {
            const count = await model.countDocuments({
                snowflakeId: { $exists: true },
            });
            console.log(
                `[dry-run] ${collectionName}: would unset snowflakeId on ${count} document(s)`,
            );
            continue;
        }

        const result = await model.updateMany(
            { snowflakeId: { $exists: true } },
            { $unset: { snowflakeId: '' } },
        );
        console.log(
            `Unset snowflakeId on ${result.modifiedCount} document(s) in ${collectionName}`,
        );
    }
}

if (require.main === module) {
    const action = process.argv[2];
    const dryRun = process.argv.includes('--dry-run');

    void (async () => {
        try {
            await connectDB();

            if (action === 'up') {
                await up({ dryRun });
            } else if (action === 'down') {
                await down({ dryRun });
            } else {
                console.error(
                    'Usage: ts-node -r tsconfig-paths/register src/migrations/backfill-snowflake-ids.ts <up|down> [--dry-run]',
                );
                process.exit(1);
            }

            await mongoose.disconnect();
            process.exit(0);
        } catch (error) {
            console.error('Migration failed:', error);
            await mongoose.disconnect();
            process.exit(1);
        }
    })();
}
