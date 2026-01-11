import mongoose, { ClientSession } from 'mongoose';
import { injectable } from 'inversify';
import logger from '@/utils/logger';

@injectable()
export class TransactionManager {
    /**
     * Executes the given function within a MongoDB transaction.
     */
    public async runInTransaction<T>(
        fn: (session: ClientSession | undefined) => Promise<T>,
    ): Promise<T> {
        if (mongoose.connection.readyState !== 1) {
            return fn(undefined);
        }

        let session: ClientSession;
        try {
            session = await mongoose.startSession();
        } catch (err: unknown) {
            const error = err as Error;
            if (
                error.message &&
                error.message.includes(
                    'Transaction numbers are only allowed on a replica set',
                )
            ) {
                logger.warn(
                    '[TransactionManager] MongoDB is running in standalone mode, transactions not supported. Running without transaction.',
                );
                return fn(undefined);
            }
            throw err;
        }

        try {
            return await session.withTransaction(async () => {
                return await fn(session);
            });
        } catch (err: unknown) {
            const error = err as Error & { codeName?: string };
            if (
                error.message &&
                (error.message.includes('Transactions are not supported') ||
                    error.codeName === 'CommandNotFound')
            ) {
                logger.warn(
                    '[TransactionManager] Transactions not supported (standalone Mongo?), running without transaction',
                );
                return fn(undefined);
            }
            throw err;
        } finally {
            session.endSession();
        }
    }
}
