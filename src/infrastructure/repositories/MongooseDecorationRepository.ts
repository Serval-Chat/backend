import { injectable } from 'inversify';
import { Decoration, type IDecoration } from '@/models/Decoration';
import type { IDecorationRepository } from '@/di/interfaces/IDecorationRepository';

@injectable()
export class MongooseDecorationRepository implements IDecorationRepository {
    public async create(data: {
        name: string;
        filename: string;
        createdBy: string;
    }): Promise<IDecoration> {
        return await new Decoration(data).save();
    }

    public async findById(id: string): Promise<IDecoration | null> {
        return await Decoration.findOne({ snowflakeId: id }).exec();
    }

    public async findByCreator(userId: string): Promise<IDecoration[]> {
        return await Decoration.find({ createdBy: userId })
            .sort({ createdAt: -1 })
            .exec();
    }

    public async delete(id: string): Promise<void> {
        await Decoration.deleteOne({ snowflakeId: id });
    }
}
