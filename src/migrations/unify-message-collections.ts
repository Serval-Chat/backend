import mongoose from 'mongoose';

import { connectDB } from '@/config/db';

interface MigrationOptions {
    dryRun?: boolean;
    batchSize?: number;
}

interface MessageDoc {
    _id: mongoose.Types.ObjectId;
    snowflakeId?: string;
}

const MESSAGES_COLLECTION = 'messages';
const SERVER_MESSAGES_COLLECTION = 'servermessages';

// Aborts the migration if any snowflakeId exists in both source collections.
// Should never happen (snowflake ids are globally generated), but this is
// exactly the kind of assumption worth verifying before merging two
// collections rather than trusting blindly.
async function assertNoSnowflakeIdCollisions(
    db: mongoose.mongo.Db,
): Promise<void> {
    const messages = db.collection<MessageDoc>(MESSAGES_COLLECTION);
    const serverMessages = db.collection<MessageDoc>(
        SERVER_MESSAGES_COLLECTION,
    );

    const messageIds = new Set<string>();
    const msgCursor = messages.find({}, { projection: { snowflakeId: 1 } });
    for await (const doc of msgCursor) {
        if (typeof doc.snowflakeId === 'string') {
            messageIds.add(doc.snowflakeId);
        }
    }

    const collisions: string[] = [];
    const smCursor = serverMessages.find(
        {},
        { projection: { snowflakeId: 1 } },
    );
    for await (const doc of smCursor) {
        if (
            typeof doc.snowflakeId === 'string' &&
            messageIds.has(doc.snowflakeId)
        ) {
            collisions.push(doc.snowflakeId);
        }
    }

    if (collisions.length > 0) {
        throw new Error(
            `Aborting: found ${collisions.length} snowflakeId collision(s) between ` +
                `${MESSAGES_COLLECTION} and ${SERVER_MESSAGES_COLLECTION}: ` +
                `${collisions.slice(0, 10).join(', ')}${collisions.length > 10 ? ', ...' : ''}`,
        );
    }
}

export async function up(options: MigrationOptions = {}): Promise<void> {
    const db = mongoose.connection.db;
    if (!db) {
        throw new Error('Database connection not established');
    }

    console.log('Checking for snowflakeId collisions...');
    await assertNoSnowflakeIdCollisions(db);
    console.log('No collisions found.');

    const messages = db.collection(MESSAGES_COLLECTION);
    const serverMessages = db.collection(SERVER_MESSAGES_COLLECTION);
    const total = await serverMessages.countDocuments({});

    if (options.dryRun === true) {
        console.log(
            `Dry run: would copy ${total} server message(s) into the unified ${MESSAGES_COLLECTION} collection.`,
        );
        return;
    }

    const batchSize = options.batchSize ?? 500;
    let copied = 0;
    let ops: mongoose.mongo.AnyBulkWriteOperation[] = [];

    const cursor = serverMessages.find({});
    for await (const doc of cursor) {
        ops.push({ insertOne: { document: doc } });
        if (ops.length >= batchSize) {
            await messages.bulkWrite(ops, { ordered: false });
            copied += ops.length;
            ops = [];
            console.log(`Copied ${copied}/${total}...`);
        }
    }
    if (ops.length > 0) {
        await messages.bulkWrite(ops, { ordered: false });
        copied += ops.length;
    }

    console.log(
        `Copied ${copied} server message(s) into the unified ${MESSAGES_COLLECTION} collection. ` +
            `${SERVER_MESSAGES_COLLECTION} was left untouched.`,
    );
}

// Removes the server-origin messages copied by up(), identified by having
// serverId set (only ever true for messages that came from
// servermessages). Does not touch the original servermessages collection,
// which up() never modified either.
export async function down(options: MigrationOptions = {}): Promise<void> {
    const db = mongoose.connection.db;
    if (!db) {
        throw new Error('Database connection not established');
    }

    const messages = db.collection(MESSAGES_COLLECTION);
    const filter = { serverId: { $exists: true } };

    if (options.dryRun === true) {
        const count = await messages.countDocuments(filter);
        console.log(
            `Dry run: would remove ${count} server-origin message(s) from ${MESSAGES_COLLECTION}.`,
        );
        return;
    }

    const result = await messages.deleteMany(filter);
    console.log(
        `Removed ${result.deletedCount} server-origin message(s) from ${MESSAGES_COLLECTION}.`,
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
                    'Usage: ts-node -r tsconfig-paths/register src/migrations/unify-message-collections.ts <up|down> [--dry-run]',
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
