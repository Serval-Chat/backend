import mongoose from 'mongoose';

import { connectDB } from '@/config/db';
import { Channel } from '@/models/Server';

interface MigrationOptions {
    dryRun?: boolean;
    batchSize?: number;
}

interface MessageDoc {
    _id: mongoose.Types.ObjectId;
    senderId: string;
    receiverId: string;
}

// Get-or-create the DM channel for a pair of users.
async function getOrCreateDmChannelId(
    userA: string,
    userB: string,
    cache: Map<string, string>,
    options: MigrationOptions,
): Promise<string> {
    const recipientIds = [userA, userB].sort();
    const key = recipientIds.join(':');

    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    const existing = await Channel.findOne({
        type: { $in: ['dm', 'group_dm'] },
        recipientIds: { $size: recipientIds.length, $all: recipientIds },
    }).lean();

    if (existing !== null) {
        cache.set(key, existing.snowflakeId);
        return existing.snowflakeId;
    }

    if (options.dryRun === true) {
        const placeholder = `dry-run:${key}`;
        cache.set(key, placeholder);
        return placeholder;
    }

    const created = await new Channel({
        type: 'dm',
        recipientIds,
    }).save();
    cache.set(key, created.snowflakeId);
    return created.snowflakeId;
}

export async function up(options: MigrationOptions = {}): Promise<void> {
    const db = mongoose.connection.db;
    if (!db) {
        throw new Error('Database connection not established');
    }

    const messages = db.collection<MessageDoc>('messages');
    const cursor = messages.find(
        { channelId: { $exists: false } },
        { projection: { _id: 1, senderId: 1, receiverId: 1 } },
    );

    const batchSize = options.batchSize ?? 500;
    const channelIdCache = new Map<string, string>();
    let ops: mongoose.mongo.AnyBulkWriteOperation<MessageDoc>[] = [];
    let processed = 0;
    let updated = 0;

    for await (const doc of cursor) {
        processed += 1;
        const channelId = await getOrCreateDmChannelId(
            doc.senderId,
            doc.receiverId,
            channelIdCache,
            options,
        );

        if (options.dryRun === true) {
            updated += 1;
            continue;
        }

        ops.push({
            updateOne: {
                filter: { _id: doc._id },
                update: { $set: { channelId } },
            },
        });

        if (ops.length >= batchSize) {
            await messages.bulkWrite(ops, { ordered: false });
            updated += ops.length;
            ops = [];
        }
    }

    if (ops.length > 0) {
        await messages.bulkWrite(ops, { ordered: false });
        updated += ops.length;
    }

    console.log(
        `${options.dryRun === true ? 'Dry run checked' : 'Backfilled channelId for'} ${updated}/${processed} DM message(s) across ${channelIdCache.size} distinct conversation(s)`,
    );
}

export async function down(options: MigrationOptions = {}): Promise<void> {
    const db = mongoose.connection.db;
    if (!db) {
        throw new Error('Database connection not established');
    }

    const messages = db.collection('messages');

    const dmFilter = {
        channelId: { $exists: true },
        receiverId: { $exists: true },
    };

    if (options.dryRun === true) {
        const count = await messages.countDocuments(dmFilter);
        console.log(`Dry run: would unset channelId on ${count} message(s)`);
        return;
    }

    const result = await messages.updateMany(dmFilter, {
        $unset: { channelId: '' },
    });
    console.log(`Unset channelId on ${result.modifiedCount} message(s)`);
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
                    'Usage: ts-node -r tsconfig-paths/register src/migrations/backfill-dm-message-channel-ids.ts <up|down> [--dry-run]',
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
