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

    // Mark a warning as acknowledged by the user */
    public async acknowledge(id: string): Promise<IWarning | null> {
        return await this.warningModel
            .findOneAndUpdate(
                { snowflakeId: id },
                {
                    acknowledged: true,
                    acknowledgedAt: new Date(),
                },
                { returnDocument: 'after' },
            )
            .lean();
    }

    public async countByUserId(userId: string): Promise<number> {
        return await this.warningModel.countDocuments({ userId });
    }

    public async create(data: {
        userId: string;
        message: string;
        issuedBy: string;
    }): Promise<IWarning> {
        const warning = new this.warningModel({
            userId: data.userId,
            message: data.message,
            issuedBy: data.issuedBy,
            acknowledged: false,
            timestamp: new Date(),
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
