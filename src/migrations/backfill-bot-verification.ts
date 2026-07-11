import mongoose from 'mongoose';
import { connectDB } from '@/config/db';

export async function up() {
    const db = mongoose.connection.db;
    if (!db) {
        throw new Error('Database connection not established');
    }

    const botsResult = await db.collection('bots').updateMany(
        {
            $or: [
                { verified: { $exists: false } },
                { verificationRequested: { $exists: false } },
                { verificationOverride: { $exists: false } },
            ],
        },
        {
            $set: {
                verified: false,
                verificationRequested: false,
                verificationOverride: null,
            },
        },
    );

    const usersResult = await db
        .collection('users')
        .updateMany(
            { botVerified: { $exists: false } },
            { $set: { botVerified: false } },
        );

    console.log(
        `Migration complete: backfilled verification fields on ${botsResult.modifiedCount} bot documents and botVerified on ${usersResult.modifiedCount} user documents`,
    );
}

export async function down() {
    const db = mongoose.connection.db;
    if (!db) {
        throw new Error('Database connection not established');
    }

    const botsResult = await db.collection('bots').updateMany(
        {},
        {
            $unset: {
                verified: '',
                verificationRequested: '',
                verificationOverride: '',
            },
        },
    );

    const usersResult = await db
        .collection('users')
        .updateMany({}, { $unset: { botVerified: '' } });

    console.log(
        `Rollback complete: removed verification fields from ${botsResult.modifiedCount} bot documents and botVerified from ${usersResult.modifiedCount} user documents`,
    );
}

if (require.main === module) {
    const action = process.argv[2];

    void (async () => {
        try {
            await connectDB();

            if (action === 'up') {
                await up();
            } else if (action === 'down') {
                await down();
            } else {
                console.error(
                    'Usage: ts-node -r tsconfig-paths/register src/migrations/backfill-bot-verification.ts <up|down>',
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
