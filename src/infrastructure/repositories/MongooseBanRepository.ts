import { IBanRepository, IBan } from '@/di/interfaces/IBanRepository';
import { IBanHistoryEntry } from '@/models/Ban';
import { Ban } from '@/models/Ban';
import { injectable } from 'inversify';

// Mongoose Ban repository
//
// Implements IBanRepository using Mongoose Ban model
// Encapsulates all ban-related database operations
@injectable()
export class MongooseBanRepository implements IBanRepository {
    private banModel = Ban;
    public constructor() {}

    public async findActiveByUserId(userId: string): Promise<IBan | null> {
        return await this.banModel.findOne({ userId, active: true }).lean();
    }

    public async create(
        userId: string,
        reason: string,
        expirationTimestamp?: Date,
    ): Promise<IBan> {
        const ban = new this.banModel({
            userId,
            reason,
            active: true,
            expirationTimestamp,
        });
        return await ban.save();
    }

    public async expire(banId: string): Promise<boolean> {
        const result = await this.banModel.updateOne(
            { snowflakeId: banId },
            { active: false },
        );
        return result.modifiedCount > 0;
    }

    public async checkExpired(userId: string): Promise<void> {
        await this.banModel.checkExpired(userId);
    }

    public async findAllActive(): Promise<IBan[]> {
        return await this.banModel
            .find({ active: true })
            .select('userId')
            .lean();
    }

    // issuedBy is a plain snowflakeId string, AdminController displays it as-is,
    // so populating to a User document would be wasted work.
    public async findByUserIdWithHistory(userId: string): Promise<IBan | null> {
        return await this.banModel.findOne({ userId }).lean();
    }

    // Create or update a ban with history tracking.
    //
    // If a ban already exists for the user, it is updated and the new ban
    // Is added to the history array. If no ban exists, a new one is created.
    public async createOrUpdateWithHistory(data: {
        userId: string;
        reason: string;
        issuedBy: string;
        expirationTimestamp?: Date;
    }): Promise<IBan> {
        const { userId, reason, issuedBy, expirationTimestamp } = data;
        const now = new Date();

        const historyEntry = {
            reason: reason.trim(),
            issuedBy,
            timestamp: now,
            expirationTimestamp,
        };

        const ban = await this.banModel.findOne({ userId });

        if (ban) {
            if (!Array.isArray(ban.history)) {
                ban.history = [];
            }

            if (ban.history.length > 0) {
                const lastEntry = ban.history[ban.history.length - 1];
                if (lastEntry && lastEntry.endedAt === undefined) {
                    lastEntry.endedAt = now;
                }
            }

            ban.history.push(historyEntry as IBanHistoryEntry);
            ban.reason = historyEntry.reason;
            if (historyEntry.expirationTimestamp !== undefined) {
                ban.expirationTimestamp = historyEntry.expirationTimestamp;
            }
            ban.issuedBy = issuedBy;
            ban.timestamp = now;
            ban.active = true;
            await ban.save();
            return ban.toObject();
        } else {
            const newBan = await this.banModel.create({
                userId,
                issuedBy,
                reason: historyEntry.reason,
                expirationTimestamp: historyEntry.expirationTimestamp,
                timestamp: now,
                active: true,
                history: [historyEntry],
            });
            return newBan.toObject();
        }
    }

    public async deactivateAllForUser(
        userId: string,
    ): Promise<{ modifiedCount: number }> {
        const result = await this.banModel.updateMany(
            { userId, active: true },
            { active: false },
        );
        return { modifiedCount: result.modifiedCount };
    }

    public async deleteAllForUser(
        userId: string,
    ): Promise<{ deletedCount: number }> {
        const result = await this.banModel.deleteMany({ userId });
        return { deletedCount: result.deletedCount };
    }

    // userId/issuedBy are plain snowflakeId strings, AdminBansAndMutes.tsx
    // displays them as-is and never needs a populated user shape.
    public async findAll(options: {
        limit?: number;
        offset?: number;
    }): Promise<IBan[]> {
        return await this.banModel
            .find({})
            .sort({ timestamp: -1 })
            .limit(options.limit ?? 50)
            .skip(options.offset ?? 0)
            .lean();
    }

    public async countActive(): Promise<number> {
        return await this.banModel.countDocuments({ active: true });
    }

    public async countCreatedAfter(date: Date): Promise<number> {
        return await this.banModel.countDocuments({ timestamp: { $gt: date } });
    }

    public async countByHour(since: Date, hours: number): Promise<number[]> {
        const msPerHour = 1000 * 60 * 60;
        const buckets = await this.banModel.aggregate<{
            _id: number;
            count: number;
        }>([
            { $match: { timestamp: { $gte: since } } },
            {
                $group: {
                    _id: {
                        $floor: {
                            $divide: [
                                { $subtract: ['$timestamp', since] },
                                msPerHour,
                            ],
                        },
                    },
                    count: { $sum: 1 },
                },
            },
        ]);
        const result = Array<number>(hours).fill(0);
        for (const b of buckets) {
            const idx = Math.floor(b._id);
            if (idx >= 0 && idx < hours) result[idx] = b.count;
        }
        return result;
    }

    public async countByDay(since: Date, days: number): Promise<number[]> {
        if (days <= 0 || !Number.isFinite(days) || days > 10000) {
            return [];
        }

        const msPerDay = 1000 * 60 * 60 * 24;
        const buckets = await this.banModel.aggregate<{
            _id: number;
            count: number;
        }>([
            { $match: { timestamp: { $gte: since } } },
            {
                $group: {
                    _id: {
                        $floor: {
                            $divide: [
                                { $subtract: ['$timestamp', since] },
                                msPerDay,
                            ],
                        },
                    },
                    count: { $sum: 1 },
                },
            },
        ]);
        const result = Array<number>(days).fill(0);
        for (const b of buckets) {
            const idx = Math.floor(b._id);
            if (idx >= 0 && idx < days) result[idx] = b.count;
        }
        return result;
    }

    public async countAllByDay(): Promise<number[]> {
        const oldestBan = await this.banModel
            .findOne()
            .sort({ timestamp: 1 })
            .lean();
        if (oldestBan === null) return [];

        const now = new Date();
        const startOfOldestDay = new Date(oldestBan.timestamp);
        startOfOldestDay.setHours(0, 0, 0, 0);

        const diffTime = Math.abs(now.getTime() - startOfOldestDay.getTime());
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return this.countByDay(startOfOldestDay, days);
    }
}
