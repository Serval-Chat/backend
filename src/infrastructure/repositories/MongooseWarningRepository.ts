import { type QueryFilter } from 'mongoose';
import {
    IWarningRepository,
    IWarning,
} from '@/di/interfaces/IWarningRepository';
import { Warning } from '@/models/Warning';
import { injectable } from 'inversify';

@injectable()
export class MongooseWarningRepository implements IWarningRepository {
    private warningModel = Warning;
    public constructor() {}

    public async findByUserId(
        userId: string,
        acknowledged?: boolean,
    ): Promise<IWarning[]> {
        const filter: QueryFilter<unknown> = {
            userId,
        };
        if (acknowledged !== undefined) {
            filter.acknowledged = acknowledged;
        }

        return await this.warningModel
            .find(filter)
            .sort({ timestamp: -1 })
            .lean();
    }

    public async findById(id: string): Promise<IWarning | null> {
        return await this.warningModel.findOne({ snowflakeId: id }).lean();
    }

    public async acknowledge(id: string): Promise<IWarning | null> {
        const warning = await this.warningModel.findOne({ snowflakeId: id });
        if (!warning) return null;

        const acknowledgedAt = new Date();
        warning.acknowledged = true;
        warning.acknowledgedAt = acknowledgedAt;
        if (
            warning.expiryDurationMinutes !== undefined &&
            warning.expiryDurationMinutes > 0
        ) {
            const expiresAt = new Date(acknowledgedAt);
            expiresAt.setMinutes(
                expiresAt.getMinutes() + warning.expiryDurationMinutes,
            );
            warning.expiresAt = expiresAt;
        }

        await warning.save();
        return warning.toObject();
    }

    public async countByUserId(userId: string): Promise<number> {
        return await this.warningModel.countDocuments({ userId });
    }

    public async hasUnacknowledged(userId: string): Promise<boolean> {
        return (
            (await this.warningModel.exists({
                userId,
                acknowledged: false,
            })) !== null
        );
    }

    public async create(data: {
        userId: string;
        message: string;
        issuedBy: string;
        expiryDurationMinutes?: number;
    }): Promise<IWarning> {
        const warning = new this.warningModel({
            userId: data.userId,
            message: data.message,
            issuedBy: data.issuedBy,
            acknowledged: false,
            timestamp: new Date(),
            expiryDurationMinutes: data.expiryDurationMinutes,
        });

        return await warning.save();
    }

    public async deleteAllForUser(
        userId: string,
    ): Promise<{ deletedCount: number }> {
        const result = await this.warningModel.deleteMany({ userId });
        return { deletedCount: result.deletedCount };
    }

    // userId/issuedBy are plain snowflakeId strings, the admin UI displays
    // them as-is, so populating to User documents would be wasted work.
    public async findAll(options: {
        limit?: number;
        offset?: number;
    }): Promise<IWarning[]> {
        return await this.warningModel
            .find({})
            .sort({ timestamp: -1 })
            .limit(options.limit ?? 50)
            .skip(options.offset ?? 0)
            .lean();
    }
}
