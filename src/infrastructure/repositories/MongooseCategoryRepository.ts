import { injectable } from 'inversify';
import {
    ICategoryRepository,
    ICategory,
    CreateCategoryDTO,
} from '@/di/interfaces/ICategoryRepository';
import { Category } from '@/models/Server';

/**
 * Transform MongoDB document to match ICategory interface.
 *
 * Ensures that ObjectIds are converted to strings for the domain model.
 */
const transformCategory = (doc: any): ICategory | null => {
    if (!doc) return null;

    return {
        ...doc,
        _id: doc._id.toString(),
        serverId: doc.serverId.toString(),
    };
};

/**
 * Mongoose Category Repository
 *
 * Implements ICategoryRepository using Mongoose Category model.
 */
@injectable()
export class MongooseCategoryRepository implements ICategoryRepository {
    async findById(id: string): Promise<ICategory | null> {
        const result = await Category.findById(id).lean();
        return transformCategory(result);
    }

    async findByIdAndServer(
        id: string,
        serverId: string,
    ): Promise<ICategory | null> {
        const result = await Category.findOne({ _id: id, serverId }).lean();
        return transformCategory(result);
    }

    async findByServerId(serverId: string): Promise<ICategory[]> {
        const results = await Category.find({ serverId })
            .sort({ position: 1 })
            .lean();
        return results.map(transformCategory).filter(Boolean) as ICategory[];
    }

    async findMaxPositionByServerId(
        serverId: string,
    ): Promise<ICategory | null> {
        const result = await Category.findOne({ serverId })
            .sort({ position: -1 })
            .lean();
        return transformCategory(result);
    }

    async create(data: CreateCategoryDTO): Promise<ICategory> {
        const category = new Category(data);
        const result = await category.save();
        return transformCategory(result.toObject())!;
    }

    async update(
        id: string,
        data: Partial<ICategory>,
    ): Promise<ICategory | null> {
        const result = await Category.findByIdAndUpdate(id, data, {
            new: true,
        }).lean();
        return transformCategory(result);
    }

    async delete(id: string): Promise<boolean> {
        const result = await Category.deleteOne({ _id: id });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }

    async updatePosition(
        id: string,
        position: number,
    ): Promise<ICategory | null> {
        const result = await Category.findByIdAndUpdate(
            id,
            { position },
            { new: true },
        ).lean();
        return transformCategory(result);
    }

    async deleteByServerId(serverId: string): Promise<number> {
        const result = await Category.deleteMany({ serverId });
        return result.deletedCount || 0;
    }

    async updatePositions(
        updates: { id: string; position: number }[],
    ): Promise<boolean> {
        try {
            const updatePromises = updates.map(({ id, position }) =>
                Category.findByIdAndUpdate(id, { position }),
            );
            await Promise.all(updatePromises);
            return true;
        } catch (error) {
            throw error;
        }
    }
}
