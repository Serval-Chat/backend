import { injectable } from 'inversify';
import {
    ICategoryRepository,
    ICategory,
    CreateCategoryDTO,
} from '@/di/interfaces/ICategoryRepository';
import { Category } from '@/models/Server';

// Transform MongoDB document to match ICategory interface
const transformCategory = (doc: unknown): ICategory | null => {
    if (doc === null || doc === undefined) return null;
    const record = doc as Record<string, unknown>;

    return {
        ...record,
        _id: record._id,
        serverId: record.serverId,
    } as ICategory;
};

// Mongoose Category repository
//
// Implements ICategoryRepository using Mongoose Category model
@injectable()
export class MongooseCategoryRepository implements ICategoryRepository {
    public async findById(id: string): Promise<ICategory | null> {
        const result = await Category.findOne({ snowflakeId: id }).lean();
        return transformCategory(result);
    }

    public async findByIdAndServer(
        id: string,
        serverId: string,
    ): Promise<ICategory | null> {
        const result = await Category.findOne({
            snowflakeId: id,
            serverId,
        }).lean();
        return transformCategory(result);
    }

    public async findByServerId(serverId: string): Promise<ICategory[]> {
        const results = await Category.find({ serverId })
            .sort({ position: 1 })
            .lean();
        return results.map(transformCategory).filter(Boolean) as ICategory[];
    }

    public async findMaxPositionByServerId(
        serverId: string,
    ): Promise<ICategory | null> {
        const result = await Category.findOne({ serverId })
            .sort({ position: -1 })
            .lean();
        return transformCategory(result);
    }

    public async create(data: CreateCategoryDTO): Promise<ICategory> {
        const category = new Category(data);
        const result = await category.save();
        const transformed = transformCategory(result.toObject());
        if (transformed === null) throw new Error('Failed to create category');
        return transformed;
    }

    public async update(
        id: string,
        data: Partial<ICategory>,
    ): Promise<ICategory | null> {
        const result = await Category.findOneAndUpdate(
            { snowflakeId: id },
            data,
            { returnDocument: 'after' },
        ).lean();
        return transformCategory(result);
    }

    public async delete(id: string): Promise<boolean> {
        const result = await Category.deleteOne({ snowflakeId: id });
        return result.deletedCount > 0;
    }

    public async updatePosition(
        id: string,
        position: number,
    ): Promise<ICategory | null> {
        const result = await Category.findOneAndUpdate(
            { snowflakeId: id },
            { position },
            { returnDocument: 'after' },
        ).lean();
        return transformCategory(result);
    }

    public async deleteByServerId(serverId: string): Promise<number> {
        const result = await Category.deleteMany({ serverId });
        return result.deletedCount;
    }

    public async updatePositions(
        updates: { id: string; position: number }[],
    ): Promise<boolean> {
        try {
            const updatePromises = updates.map(({ id, position }) =>
                Category.findOneAndUpdate({ snowflakeId: id }, { position }),
            );
            await Promise.all(updatePromises);
            return true;
        } catch (error) {
            throw error;
        }
    }
}
