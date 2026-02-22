import { Injectable } from '@nestjs/common';
import { Types, type FilterQuery } from 'mongoose';
import {
    IWarningRepository,
    IWarning,
} from '@/di/interfaces/IWarningRepository';
import { Warning } from '@/models/Warning';
import { injectable } from 'inversify';

@injectable()
@Injectable()
export class MongooseWarningRepository implements IWarningRepository {
    private warningModel = Warning;
    constructor() { }

    async findByUserId(
        userId: Types.ObjectId,
        acknowledged?: boolean,
    ): Promise<IWarning[]> {
        const filter: FilterQuery<IWarning> = {
            userId,
        };
        if (acknowledged !== undefined) {
            filter.acknowledged = acknowledged;
        }

        return (await this.warningModel
            .find(filter)
            .sort({ timestamp: -1 })
            .populate('issuedBy', 'username')
            .lean()) as unknown as IWarning[];
    }

    async findById(id: Types.ObjectId): Promise<IWarning | null> {
        return (await this.warningModel
            .findById(id)
            .lean()) as unknown as IWarning | null;
    }

    // Mark a warning as acknowledged by the user */
    async acknowledge(id: Types.ObjectId): Promise<IWarning | null> {
        return (await this.warningModel
            .findByIdAndUpdate(
                id,
                {
                    acknowledged: true,
                    acknowledgedAt: new Date(),
                },
                { new: true },
            )
            .lean()) as unknown as IWarning | null;
    }

    async countByUserId(userId: Types.ObjectId): Promise<number> {
        return await this.warningModel.countDocuments({ userId });
    }

    async create(data: {
        userId: Types.ObjectId;
        message: string;
        issuedBy: Types.ObjectId;
    }): Promise<IWarning> {
        const warning = new this.warningModel({
            userId: data.userId,
            message: data.message,
            issuedBy: data.issuedBy,
            acknowledged: false,
            timestamp: new Date(),
        });

        return (await warning.save()) as unknown as IWarning;
    }

    async deleteAllForUser(
        userId: Types.ObjectId,
    ): Promise<{ deletedCount: number }> {
        const result = await this.warningModel.deleteMany({ userId });
        return { deletedCount: result.deletedCount };
    }

    async findAll(options: {
        limit?: number;
        offset?: number;
    }): Promise<IWarning[]> {
        return (await this.warningModel
            .find({})
            .sort({ timestamp: -1 })
            .limit(options.limit || 50)
            .skip(options.offset || 0)
            .populate('userId', 'username')
            .populate('issuedBy', 'username')
            .lean()) as unknown as IWarning[];
    }
}
