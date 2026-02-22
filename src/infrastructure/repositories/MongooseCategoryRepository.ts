import { injectable } from 'inversify';
import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import {
    ICategoryRepository,
    ICategory,
    CreateCategoryDTO,
} from '@/di/interfaces/ICategoryRepository';
import { Category } from '@/models/Server';

// Transform MongoDB document to match ICategory interface
const transformCategory = (doc: Record<string, unknown> | null): ICategory | null => {
    if (!doc) return null;

    return {
        ...doc,
        _id: doc._id,
        serverId: doc.serverId,
    } as unknown as ICategory;
};

// Mongoose Category repository
//
// Implements ICategoryRepository using Mongoose Category model
@injectable()
@Injectable()
export class MongooseCategoryRepository implements ICategoryRepository {
    async findById(id: Types.ObjectId): Promise<ICategory | null> {
        const result = await Category.findById(id).lean();
        return transformCategory(result);
    }

    async findByIdAndServer(
        id: Types.ObjectId,
        serverId: Types.ObjectId,
    ): Promise<ICategory | null> {
        const result = await Category.findOne({ _id: id, serverId }).lean();
        return transformCategory(result);
    }

    async findByServerId(serverId: Types.ObjectId): Promise<ICategory[]> {
        const results = await Category.find({ serverId })
            .sort({ position: 1 })
            .lean();
        return results.map(transformCategory).filter(Boolean) as ICategory[];
    }

    async findMaxPositionByServerId(
        serverId: Types.ObjectId,
    ): Promise<ICategory | null> {
        const result = await Category.findOne({ serverId })
            .sort({ position: -1 })
            .lean();
        return transformCategory(result);
    }

    async create(data: CreateCategoryDTO): Promise<ICategory> {
        const category = new Category(data);
        const result = await category.save();
        return transformCategory(result.toObject() as unknown as Record<string, unknown>)!;
    }

    async update(
        id: Types.ObjectId,
        data: Partial<ICategory>,
    ): Promise<ICategory | null> {
        const result = await Category.findByIdAndUpdate(id, data, {
            new: true,
        }).lean();
        return transformCategory(result);
    }

    async delete(id: Types.ObjectId): Promise<boolean> {
        const result = await Category.deleteOne({ _id: id });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }

    async updatePosition(
        id: Types.ObjectId,
        position: number,
    ): Promise<ICategory | null> {
        const result = await Category.findByIdAndUpdate(
            id,
            { position },
            { new: true },
        ).lean();
        return transformCategory(result);
    }

    async deleteByServerId(serverId: Types.ObjectId): Promise<number> {
        const result = await Category.deleteMany({ serverId });
        return result.deletedCount || 0;
    }

    async updatePositions(
        updates: { id: Types.ObjectId; position: number }[],
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
