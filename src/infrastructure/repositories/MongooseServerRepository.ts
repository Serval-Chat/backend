import { injectable } from 'inversify';
import {
    IServerRepository,
    IServer,
    CreateServerDTO,
} from '@/di/interfaces/IServerRepository';
import { Server } from '@/models/Server';

/**
 * Mongoose Server Repository
 *
 * Implements IServerRepository using Mongoose Server model.
 */
@injectable()
export class MongooseServerRepository implements IServerRepository {
    async findById(
        id: string,
        includeDeleted: boolean = false,
    ): Promise<IServer | null> {
        const query: any = { _id: id };
        if (!includeDeleted) {
            query.deletedAt = { $exists: false };
        }
        return await Server.findOne(query).lean();
    }

    async findByIds(ids: string[]): Promise<IServer[]> {
        return await Server.find({
            _id: { $in: ids },
            deletedAt: { $exists: false },
        }).lean();
    }

    async findByOwnerId(ownerId: string): Promise<IServer[]> {
        return await Server.find({
            ownerId,
            deletedAt: { $exists: false },
        }).lean();
    }

    async create(data: CreateServerDTO): Promise<IServer> {
        const server = new Server(data);
        return await server.save();
    }

    async update(id: string, data: Partial<IServer>): Promise<IServer | null> {
        return await Server.findOneAndUpdate(
            { _id: id, deletedAt: { $exists: false } },
            data,
            { new: true },
        ).lean();
    }

    async delete(id: string): Promise<boolean> {
        const result = await Server.deleteOne({ _id: id });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }

    /**
     * Soft delete a server.
     *
     * Marks the server as deleted by setting 'deletedAt' timestamp.
     */
    async softDelete(id: string): Promise<boolean> {
        const result = await Server.updateOne(
            { _id: id },
            { $set: { deletedAt: new Date() } },
        );
        return result.modifiedCount > 0;
    }

    /**
     * Restore a soft-deleted server.
     */
    async restore(id: string): Promise<boolean> {
        const result = await Server.updateOne(
            { _id: id },
            { $unset: { deletedAt: 1 } },
        );
        return result.modifiedCount > 0;
    }

    async clearDefaultRole(serverId: string, roleId: string): Promise<boolean> {
        const result = await Server.updateOne(
            { _id: serverId, defaultRoleId: roleId },
            { $unset: { defaultRoleId: 1 } },
        );
        return result.modifiedCount > 0;
    }

    async findMany(options: {
        limit: number;
        offset: number;
        search?: string;
        includeDeleted?: boolean;
    }): Promise<IServer[]> {
        const query: any = {};

        if (!options.includeDeleted) {
            query.deletedAt = { $exists: false };
        }

        if (options.search) {
            query.$or = [
                { name: { $regex: options.search, $options: 'i' } },
                { _id: options.search }, // Exact match for ID
            ];
        }
        return await Server.find(query)
            .skip(options.offset)
            .limit(options.limit)
            .sort({ createdAt: -1 })
            .lean();
    }

    async count(includeDeleted: boolean = false): Promise<number> {
        const query: any = {};
        if (!includeDeleted) {
            query.deletedAt = { $exists: false };
        }
        return await Server.countDocuments(query);
    }

    async countCreatedAfter(date: Date): Promise<number> {
        return await Server.countDocuments({ createdAt: { $gt: date } });
    }
}
