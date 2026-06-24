import { IMuteRepository, IMute } from '@/di/interfaces/IMuteRepository';
import { Mute } from '@/models/Mute';
import { injectable } from 'inversify';

@injectable()
export class MongooseMuteRepository implements IMuteRepository {
    private muteModel = Mute;
    public constructor() {}

    public async findActiveByUserId(userId: string): Promise<IMute | null> {
        return await this.muteModel.findOne({ userId, active: true }).lean();
    }

    public async create(
        userId: string,
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

    public async expire(muteId: string): Promise<boolean> {
        const result = await this.muteModel.updateOne(
            { snowflakeId: muteId },
            { active: false },
        );
        return result.modifiedCount > 0;
    }

    public async checkExpired(userId: string): Promise<void> {
        await this.muteModel.checkExpired(userId);
    }

    public async findAllActive(): Promise<IMute[]> {
        return await this.muteModel
            .find({ active: true })
            .select('userId')
            .lean();
    }

    // issuedBy is a plain snowflakeId string, AdminController displays it as-is,
    // so populating it would be wasted work.
    public async findByUserIdWithHistory(
        userId: string,
    ): Promise<IMute | null> {
        return await this.muteModel.findOne({ userId }).lean();
    }

    public async createOrUpdateWithHistory(data: {
        userId: string;
        reason: string;
        issuedBy: string;
        expirationTimestamp?: Date;
    }): Promise<IMute> {
        const { userId, reason, issuedBy, expirationTimestamp } = data;
        const now = new Date();

        const historyEntry = {
            reason: reason.trim(),
            issuedBy,
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

            mute.history.push(historyEntry);
            mute.reason = historyEntry.reason;
            if (historyEntry.expirationTimestamp !== undefined) {
                mute.expirationTimestamp = historyEntry.expirationTimestamp;
            } else {
                mute.expirationTimestamp = undefined;
            }
            mute.issuedBy = issuedBy;
            mute.timestamp = now;
            mute.active = true;
            await mute.save();
            return mute.toObject();
        } else {
            const newMute = await this.muteModel.create({
                userId,
                issuedBy,
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
        userId: string,
    ): Promise<{ modifiedCount: number }> {
        const result = await this.muteModel.updateMany(
            { userId, active: true },
            { active: false },
        );
        return { modifiedCount: result.modifiedCount };
    }

    public async deleteAllForUser(
        userId: string,
    ): Promise<{ deletedCount: number }> {
        const result = await this.muteModel.deleteMany({ userId });
        return { deletedCount: result.deletedCount };
    }

    // userId/issuedBy are plain snowflakeId strings, AdminBansAndMutes.tsx
    // displays them as-is and never needs populated user objects.
    public async findAll(options: {
        limit?: number;
        offset?: number;
    }): Promise<IMute[]> {
        return await this.muteModel
            .find({})
            .sort({ timestamp: -1 })
            .limit(options.limit ?? 50)
            .skip(options.offset ?? 0)
            .lean();
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
