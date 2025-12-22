import { injectable } from 'inversify';
import {
    IWarningRepository,
    IWarning,
} from '../../di/interfaces/IWarningRepository';
import { Warning } from '../../models/Warning';
import { Types } from 'mongoose';

@injectable()
export class MongooseWarningRepository implements IWarningRepository {
    async findByUserId(
        userId: string,
        acknowledged?: boolean,
    ): Promise<IWarning[]> {
        const filter: any = { userId: new Types.ObjectId(userId) };
        if (acknowledged !== undefined) {
            filter.acknowledged = acknowledged;
        }

        return (await Warning.find(filter)
            .sort({ timestamp: -1 })
            .populate('issuedBy', 'username')
            .lean()) as unknown as IWarning[];
    }

    async findById(id: string): Promise<IWarning | null> {
        return (await Warning.findById(
            id,
        ).lean()) as unknown as IWarning | null;
    }

    /**
     * Mark a warning as acknowledged by the user.
     */
    async acknowledge(id: string): Promise<IWarning | null> {
        return (await Warning.findByIdAndUpdate(
            id,
            {
                acknowledged: true,
                acknowledgedAt: new Date(),
            },
            { new: true },
        ).lean()) as unknown as IWarning | null;
    }

    async countByUserId(userId: string): Promise<number> {
        return await Warning.countDocuments({ userId });
    }

    async create(data: {
        userId: string;
        message: string;
        issuedBy: string;
    }): Promise<IWarning> {
        const warning = new Warning({
            userId: new Types.ObjectId(data.userId),
            message: data.message,
            issuedBy: new Types.ObjectId(data.issuedBy),
            acknowledged: false,
            timestamp: new Date(),
        });

        return (await warning.save()) as unknown as IWarning;
    }

    async deleteAllForUser(userId: string): Promise<{ deletedCount: number }> {
        const result = await Warning.deleteMany({ userId });
        return { deletedCount: result.deletedCount };
    }

    async findAll(options: {
        limit?: number;
        offset?: number;
    }): Promise<IWarning[]> {
        return (await Warning.find({})
            .sort({ timestamp: -1 })
            .limit(options.limit || 50)
            .skip(options.offset || 0)
            .populate('userId', 'username')
            .populate('issuedBy', 'username')
            .lean()) as unknown as IWarning[];
    }
}
