import { injectable } from 'inversify';
import { IBanRepository, IBan } from '../../di/interfaces/IBanRepository';
import { Ban } from '../../models/Ban';
import { Types } from 'mongoose';
import logger from '../../utils/logger';

/**
 * Mongoose Ban Repository
 *
 * Implements IBanRepository using Mongoose Ban model.
 * Encapsulates all ban-related database operations.
 */
@injectable()
export class MongooseBanRepository implements IBanRepository {
    async findActiveByUserId(userId: string): Promise<IBan | null> {
        return await Ban.findOne({ userId, active: true }).lean();
    }

    async create(
        userId: string,
        reason: string,
        expirationTimestamp?: Date,
    ): Promise<IBan> {
        const ban = new Ban({
            userId,
            reason,
            active: true,
            expirationTimestamp,
        });
        return await ban.save();
    }

    async expire(banId: string): Promise<boolean> {
        const result = await Ban.updateOne({ _id: banId }, { active: false });
        return result.modifiedCount ? result.modifiedCount > 0 : false;
    }

    async checkExpired(userId: string): Promise<void> {
        await Ban.checkExpired(userId);
    }

    async findAllActive(): Promise<IBan[]> {
        return await Ban.find({ active: true }).select('userId').lean();
    }

    async findByUserIdWithHistory(userId: string): Promise<IBan | null> {
        return await Ban.findOne({ userId })
            .populate('history.issuedBy', 'username')
            .lean();
    }

    /**
     * Create or update a ban with history tracking.
     *
     * If a ban already exists for the user, it is updated and the new ban
     * is added to the history array. If no ban exists, a new one is created.
     */
    async createOrUpdateWithHistory(data: {
        userId: string;
        reason: string;
        issuedBy: string;
        expirationTimestamp?: Date;
    }): Promise<IBan> {
        const { userId, reason, issuedBy, expirationTimestamp } = data;
        const issuedById = new Types.ObjectId(issuedBy);
        const now = new Date();

        const historyEntry = {
            reason: reason.trim(),
            issuedBy: issuedById,
            timestamp: now,
            expirationTimestamp,
        };

        const ban = await Ban.findOne({ userId });

        if (ban) {
            if (!Array.isArray(ban.history)) {
                ban.history = [];
            }

            if (ban.history.length > 0) {
                const lastEntry = ban.history[ban.history.length - 1];
                if (lastEntry && !lastEntry.endedAt) {
                    lastEntry.endedAt = now;
                }
            }

            ban.history.push(historyEntry as any);
            ban.reason = historyEntry.reason;
            if (historyEntry.expirationTimestamp) {
                ban.expirationTimestamp = historyEntry.expirationTimestamp;
            }
            ban.issuedBy = issuedById;
            ban.timestamp = now;
            ban.active = true;
            await ban.save();
            return ban.toObject();
        } else {
            const newBan = await Ban.create({
                userId,
                issuedBy: issuedById,
                reason: historyEntry.reason,
                expirationTimestamp: historyEntry.expirationTimestamp,
                timestamp: now,
                active: true,
                history: [historyEntry],
            });
            return newBan.toObject();
        }
    }

    async deactivateAllForUser(
        userId: string,
    ): Promise<{ modifiedCount: number }> {
        const result = await Ban.updateMany(
            { userId, active: true },
            { active: false },
        );
        return { modifiedCount: result.modifiedCount };
    }

    async deleteAllForUser(userId: string): Promise<{ deletedCount: number }> {
        const result = await Ban.deleteMany({ userId });
        return { deletedCount: result.deletedCount };
    }

    async findAll(options: {
        limit?: number;
        offset?: number;
    }): Promise<IBan[]> {
        try {
            return await Ban.find({})
                .sort({ timestamp: -1 })
                .limit(options.limit || 50)
                .skip(options.offset || 0)
                .populate([
                    {
                        path: 'userId',
                        select: 'username',
                        match: { deletedAt: { $exists: false } }, // Only populate non-deleted users
                    },
                    {
                        path: 'issuedBy',
                        select: 'username',
                        match: { deletedAt: { $exists: false } }, // Only populate non-deleted users
                    },
                ])
                .lean();
        } catch (error) {
            /**
             * Fallback to unpopulated query if there are issues with population
             * (e.g., missing users).
             */

            logger.error(
                'Failed to populate ban data. Fallback to unpopulated query.',
                error,
            );

            return await Ban.find({})
                .sort({ timestamp: -1 })
                .limit(options.limit || 50)
                .skip(options.offset || 0)
                .lean();
        }
    }

    async countActive(): Promise<number> {
        return await Ban.countDocuments({ active: true });
    }

    async countCreatedAfter(date: Date): Promise<number> {
        return await Ban.countDocuments({ timestamp: { $gt: date } });
    }
}
