import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { IMuteRepository, IMute } from '@/di/interfaces/IMuteRepository';
import { IMuteHistoryEntry } from '@/models/Mute';
import logger from '@/utils/logger';
import { Mute } from '@/models/Mute';
import { injectable } from 'inversify';

@injectable()
@Injectable()
export class MongooseMuteRepository implements IMuteRepository {
    private muteModel = Mute;
    public constructor() {}

    public async findActiveByUserId(
        userId: Types.ObjectId,
    ): Promise<IMute | null> {
        return await this.muteModel.findOne({ userId, active: true }).lean();
    }

    public async create(
        userId: Types.ObjectId,
        reason: string,
        expirationTimestamp?: Date,
    ): Promise<IMute> {
        const mute = new this.muteModel({
            userId,
            reason,
            active: true,
            expirationTimestamp,
        });
        return await mute.save();
    }

    public async expire(muteId: Types.ObjectId): Promise<boolean> {
        const result = await this.muteModel.updateOne(
            { _id: muteId },
            { active: false },
        );
        return result.modifiedCount > 0;
    }

    public async checkExpired(userId: Types.ObjectId): Promise<void> {
        await this.muteModel.checkExpired(userId);
    }

    public async findAllActive(): Promise<IMute[]> {
        return await this.muteModel
            .find({ active: true })
            .select('userId')
            .lean();
    }

    public async findByUserIdWithHistory(
        userId: Types.ObjectId,
    ): Promise<IMute | null> {
        return await this.muteModel
            .findOne({ userId })
            .populate('history.issuedBy', 'username')
            .lean();
    }

    public async createOrUpdateWithHistory(data: {
        userId: Types.ObjectId;
        reason: string;
        issuedBy: Types.ObjectId;
        expirationTimestamp?: Date;
    }): Promise<IMute> {
        const { userId, reason, issuedBy, expirationTimestamp } = data;
        const issuedById = new Types.ObjectId(issuedBy);
        const now = new Date();

        const historyEntry = {
            reason: reason.trim(),
            issuedBy: issuedById,
            timestamp: now,
            expirationTimestamp,
        };

        const mute = await this.muteModel.findOne({ userId });

        if (mute) {
            if (!Array.isArray(mute.history)) {
                mute.history = [];
            }

            if (mute.history.length > 0) {
                const lastEntry = mute.history[mute.history.length - 1];
                if (lastEntry && lastEntry.endedAt === undefined) {
                    lastEntry.endedAt = now;
                }
            }

            mute.history.push(historyEntry as unknown as IMuteHistoryEntry);
            mute.reason = historyEntry.reason;
            if (historyEntry.expirationTimestamp !== undefined) {
                mute.expirationTimestamp = historyEntry.expirationTimestamp;
            } else {
                mute.expirationTimestamp = undefined;
            }
            mute.issuedBy = issuedById;
            mute.timestamp = now;
            mute.active = true;
            await mute.save();
            return mute.toObject();
        } else {
            const newMute = await this.muteModel.create({
                userId,
                issuedBy: issuedById,
                reason: historyEntry.reason,
                expirationTimestamp: historyEntry.expirationTimestamp,
                timestamp: now,
                active: true,
                history: [historyEntry],
            });
            return newMute.toObject();
        }
    }

    public async deactivateAllForUser(
        userId: Types.ObjectId,
    ): Promise<{ modifiedCount: number }> {
        const result = await this.muteModel.updateMany(
            { userId, active: true },
            { active: false },
        );
        return { modifiedCount: result.modifiedCount };
    }

    public async deleteAllForUser(
        userId: Types.ObjectId,
    ): Promise<{ deletedCount: number }> {
        const result = await this.muteModel.deleteMany({ userId });
        return { deletedCount: result.deletedCount };
    }

    public async findAll(options: {
        limit?: number;
        offset?: number;
    }): Promise<IMute[]> {
        try {
            return await this.muteModel
                .find({})
                .sort({ timestamp: -1 })
                .limit(options.limit ?? 50)
                .skip(options.offset ?? 0)
                .populate([
                    {
                        path: 'userId',
                        select: 'username',
                        match: { deletedAt: { $exists: false } },
                    },
                    {
                        path: 'issuedBy',
                        select: 'username',
                        match: { deletedAt: { $exists: false } },
                    },
                ])
                .lean();
        } catch (error) {
            logger.error(
                'Failed to populate mute data. Fallback to unpopulated query.',
                error,
            );

            return await this.muteModel
                .find({})
                .sort({ timestamp: -1 })
                .limit(options.limit ?? 50)
                .skip(options.offset ?? 0)
                .lean();
        }
    }

    public async countActive(): Promise<number> {
        return await this.muteModel.countDocuments({ active: true });
    }

    public async countCreatedAfter(date: Date): Promise<number> {
        return await this.muteModel.countDocuments({
            timestamp: { $gt: date },
        });
    }
}
