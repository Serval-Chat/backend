import mongoose from 'mongoose';
import { connectDB } from '@/config/db';

const LEGACY_KEY = 'permissions.export_channel_messages';
const CANONICAL_KEY = 'permissions.exportChannelMessages';

export async function up() {
    const db = mongoose.connection.db;
    if (!db) {
        throw new Error('Database connection not established');
    }

    const result = await db
        .collection('roles')
        .updateMany({ [LEGACY_KEY]: { $exists: true } }, [
            {
                $set: {
                    [CANONICAL_KEY]: {
                        $ifNull: [`$${CANONICAL_KEY}`, `$${LEGACY_KEY}`],
                    },
                },
            },
            { $unset: LEGACY_KEY },
        ]);

    console.log(
        `Migration complete: renamed export_channel_messages to exportChannelMessages in ${result.modifiedCount} role documents`,
    );
}

export async function down() {
    const db = mongoose.connection.db;
    if (!db) {
        throw new Error('Database connection not established');
    }

    const result = await db
        .collection('roles')
        .updateMany({ [CANONICAL_KEY]: { $exists: true } }, [
            {
                $set: {
                    [LEGACY_KEY]: {
                        $ifNull: [`$${LEGACY_KEY}`, `$${CANONICAL_KEY}`],
                    },
                },
            },
            { $unset: CANONICAL_KEY },
        ]);

    console.log(
        `Rollback complete: renamed exportChannelMessages to export_channel_messages in ${result.modifiedCount} role documents`,
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
                    'Usage: ts-node -r tsconfig-paths/register src/migrations/rename-export-channel-messages-permission.ts <up|down>',
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
