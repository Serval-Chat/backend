import mongoose from 'mongoose';

import { connectDB } from '@/config/db';
import { generateSnowflakeId } from '@/utils/snowflake';

interface MigrationOptions {
    dryRun?: boolean;
}

interface VanityInviteDoc {
    _id?: mongoose.Types.ObjectId;
    snowflakeId?: string;
    serverId: string;
    code: string;
    customPath?: string;
    createdByUserId: string;
    uses?: number;
    createdAt?: Date;
}

interface VanityLinkDoc {
    snowflakeId?: string;
    serverId: string;
    code: string;
    createdByUserId: string;
    createdAt?: Date;
}

const INVITES_COLLECTION = 'invites';
const VANITY_LINKS_COLLECTION = 'vanitylinks';

async function findCanonicalVanityInvitesByServer(
    invites: mongoose.mongo.Collection<VanityInviteDoc>,
): Promise<Map<string, VanityInviteDoc>> {
    const cursor = invites
        .find({ customPath: { $exists: true, $ne: '' } })
        .sort({ serverId: 1, uses: -1, createdAt: 1 });

    const canonicalByServer = new Map<string, VanityInviteDoc>();
    for await (const doc of cursor) {
        if (!canonicalByServer.has(doc.serverId)) {
            canonicalByServer.set(doc.serverId, doc);
        }
    }
    return canonicalByServer;
}

async function assertNoCodeCollisions(
    invites: mongoose.mongo.Collection<VanityInviteDoc>,
    canonicalByServer: Map<string, VanityInviteDoc>,
): Promise<void> {
    const collisions: string[] = [];

    for (const canonical of canonicalByServer.values()) {
        const clashing = await invites.findOne({
            code: canonical.customPath,
            _id: { $ne: canonical._id },
        });
        if (clashing !== null) {
            collisions.push(
                `server ${canonical.serverId}: customPath "${canonical.customPath}" ` +
                    `collides with invite code on document ${String(clashing._id)}`,
            );
        }
    }

    if (collisions.length > 0) {
        throw new Error(
            `Aborting: found ${collisions.length} code collision(s) between ` +
                `vanity customPath values and plain invite codes: ` +
                `${collisions.slice(0, 10).join('; ')}${collisions.length > 10 ? '; ...' : ''}`,
        );
    }
}

export async function up(options: MigrationOptions = {}): Promise<void> {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not established');

    const invites = db.collection<VanityInviteDoc>(INVITES_COLLECTION);
    const vanityLinks = db.collection<VanityLinkDoc>(VANITY_LINKS_COLLECTION);

    const canonicalByServer = await findCanonicalVanityInvitesByServer(invites);
    const totalVanityInvites = await invites.countDocuments({
        customPath: { $exists: true, $ne: '' },
    });

    console.log(
        `Found ${totalVanityInvites} vanity-shaped invite(s) across ` +
            `${canonicalByServer.size} server(s).`,
    );

    console.log('Checking for code collisions...');
    await assertNoCodeCollisions(invites, canonicalByServer);
    console.log('No collisions found.');

    if (options.dryRun === true) {
        console.log(
            `Dry run: would create ${canonicalByServer.size} vanitylinks ` +
                `document(s) and delete ${totalVanityInvites} vanity-shaped ` +
                `invite(s) from ${INVITES_COLLECTION}.`,
        );
        return;
    }

    if (canonicalByServer.size > 0) {
        await vanityLinks.insertMany(
            [...canonicalByServer.values()].map((canonical) => ({
                snowflakeId: generateSnowflakeId(),
                serverId: canonical.serverId,
                code: canonical.customPath as string,
                createdByUserId: canonical.createdByUserId,
                createdAt: canonical.createdAt ?? new Date(),
            })),
        );
    }

    const deleteResult = await invites.deleteMany({
        customPath: { $exists: true, $ne: '' },
    });

    console.log(
        `Created ${canonicalByServer.size} vanitylinks document(s). ` +
            `Deleted ${deleteResult.deletedCount} vanity-shaped invite(s) from ${INVITES_COLLECTION}.`,
    );
}

export async function down(options: MigrationOptions = {}): Promise<void> {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not established');

    const invites = db.collection<VanityInviteDoc>(INVITES_COLLECTION);
    const vanityLinks = db.collection<VanityLinkDoc>(VANITY_LINKS_COLLECTION);

    const total = await vanityLinks.countDocuments({});

    if (options.dryRun === true) {
        console.log(
            `Dry run: would recreate ${total} invite(s) from ${VANITY_LINKS_COLLECTION} ` +
                `and clear ${VANITY_LINKS_COLLECTION}. Non-canonical vanity invites ` +
                `deleted by up() cannot be restored.`,
        );
        return;
    }

    const cursor = vanityLinks.find({});
    let restored = 0;
    for await (const doc of cursor) {
        await invites.insertOne({
            snowflakeId: generateSnowflakeId(),
            serverId: doc.serverId,
            code: doc.code,
            customPath: doc.code,
            createdByUserId: doc.createdByUserId,
            uses: 0,
            createdAt: doc.createdAt ?? new Date(),
        });
        restored += 1;
    }

    await vanityLinks.deleteMany({});

    console.log(
        `Restored ${restored} invite(s) from ${VANITY_LINKS_COLLECTION} and cleared it. ` +
            `Non-canonical vanity invites deleted by up() were not restored (not recorded).`,
    );
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
                    'Usage: ts-node -r tsconfig-paths/register src/migrations/split-vanity-links-from-invites.ts <up|down> [--dry-run]',
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
