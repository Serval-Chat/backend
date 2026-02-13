import mongoose from 'mongoose';
import { connectDB } from '@/config/db';

/**
 * Migration: Rename adminId to actorId in AuditLog collection
 *
 * This migration renames the 'adminId' field to 'actorId' to maintain
 * consistency with the updated IAuditLog interface and AuditLog model.
 */

export async function up() {
    const db = mongoose.connection.db;
    if (!db) {
        throw new Error('Database connection not established');
    }

    const result = await db
        .collection('auditlogs')
        .updateMany(
            { adminId: { $exists: true } },
            { $rename: { adminId: 'actorId' } },
        );

    console.log(
        `Migration complete: renamed adminId to actorId in ${result.modifiedCount} documents`,
    );
}

export async function down() {
    const db = mongoose.connection.db;
    if (!db) {
        throw new Error('Database connection not established');
    }

    const result = await db
        .collection('auditlogs')
        .updateMany(
            { actorId: { $exists: true } },
            { $rename: { actorId: 'adminId' } },
        );

    console.log(
        `Rollback complete: renamed actorId to adminId in ${result.modifiedCount} documents`,
    );
}

if (require.main === module) {
    const action = process.argv[2];

    (async () => {
        try {
            await connectDB();

            if (action === 'up') {
                await up();
            } else if (action === 'down') {
                await down();
            } else {
                console.error('Usage: ts-node migration.ts <up|down>');
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

// yo run with me npx ts-node -r tsconfig-paths/register src/migrations/rename-adminId-to-actorId.ts  up
// OwO
