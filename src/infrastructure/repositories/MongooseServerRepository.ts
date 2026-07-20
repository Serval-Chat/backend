import { type PipelineStage } from 'mongoose';
import type { QueryFilter } from 'mongoose';
import {
    IServerRepository,
    IServer,
    CreateServerDTO,
    type RepositoryId,
} from '@/di/interfaces/IServerRepository';
import { Server } from '@/models/Server';
import { injectable } from 'inversify';
import { toApiId, toDatabaseId } from '@/utils/mongooseId';

// Mongoose Server repository
//
// Implements IServerRepository using Mongoose Server model
@injectable()
export class MongooseServerRepository implements IServerRepository {
    private serverModel = Server;
    public constructor() {}

    private mapOne(value: unknown): IServer | null {
        if (value === null) return null;
        const record = value as Record<string, unknown>;
        const withApiId: unknown = toApiId(record);
        return {
            ...(withApiId as IServer),
            id: record.snowflakeId,
        } as IServer;
    }

    private mapMany(value: unknown): IServer[] {
        return (value as Record<string, unknown>[]).map(
            (v) => this.mapOne(v) as IServer,
        );
    }

    public async findById(
        id: RepositoryId,
        includeDeleted: boolean = false,
    ): Promise<IServer | null> {
        const query: QueryFilter<unknown> = { snowflakeId: String(id) };
        if (includeDeleted !== true) {
            query.deletedAt = { $exists: false };
        }
        return this.mapOne(await this.serverModel.findOne(query).lean());
    }

    public async findByIds(ids: RepositoryId[]): Promise<IServer[]> {
        return this.mapMany(
            await this.serverModel
                .find({
                    snowflakeId: { $in: ids.map(String) },
                    deletedAt: { $exists: false },
                })
                .lean(),
        );
    }

    public async findByOwnerId(ownerId: string): Promise<IServer[]> {
        return this.mapMany(
            await this.serverModel
                .find({
                    ownerId,
                    deletedAt: { $exists: false },
                })
                .lean(),
        );
    }

    public async create(data: CreateServerDTO): Promise<IServer> {
        const server = new this.serverModel({
            ...toDatabaseId(data),
            ownerId: data.ownerId,
        });
        const saved = await server.save();
        return this.mapOne(saved.toObject()) as IServer;
    }

    public async update(
        id: RepositoryId,
        data: Partial<IServer>,
    ): Promise<IServer | null> {
        return this.mapOne(
            await this.serverModel
                .findOneAndUpdate(
                    {
                        snowflakeId: String(id),
                        deletedAt: { $exists: false },
                    },
                    toDatabaseId(data),
                    { returnDocument: 'after' },
                )
                .lean(),
        );
    }

    public async delete(id: RepositoryId): Promise<boolean> {
        const result = await this.serverModel.deleteOne({
            snowflakeId: String(id),
        });
        return result.deletedCount > 0;
    }

    // Soft delete a server
    //
    // Marks the server as deleted by setting 'deletedAt' timestamp
    public async softDelete(id: RepositoryId): Promise<boolean> {
        const result = await this.serverModel.updateOne(
            { snowflakeId: String(id) },
            { $set: { deletedAt: new Date() } },
        );
        return result.modifiedCount > 0;
    }

    // Restore a soft-deleted server
    public async restore(id: RepositoryId): Promise<boolean> {
        const result = await this.serverModel.updateOne(
            { snowflakeId: String(id) },
            { $unset: { deletedAt: 1 } },
        );
        return result.modifiedCount > 0;
    }

    public async clearDefaultRole(
        serverId: RepositoryId,
        roleId: RepositoryId,
    ): Promise<boolean> {
        const result = await this.serverModel.updateOne(
            {
                snowflakeId: String(serverId),
                defaultRoleId: String(roleId),
            },
            { $unset: { defaultRoleId: 1 } },
        );
        return result.modifiedCount > 0;
    }

    public async findMany(options: {
        limit: number;
        offset: number;
        search?: string;
        includeDeleted?: boolean;
    }): Promise<IServer[]> {
        const query: QueryFilter<unknown> = {};

        if (options.includeDeleted !== true) {
            query.deletedAt = { $exists: false };
        }

        if (options.search !== undefined && options.search !== '') {
            query.$or = [
                { name: { $regex: options.search, $options: 'i' } },
                { snowflakeId: options.search }, // direct id lookup alongside name search
            ];
        }
        return this.mapMany(
            await this.serverModel
                .find(query)
                .skip(options.offset)
                .limit(options.limit)
                .sort({ createdAt: -1 })
                .lean(),
        );
    }

    public async count(includeDeleted: boolean = false): Promise<number> {
        const query: QueryFilter<unknown> = {};
        if (includeDeleted !== true) {
            query.deletedAt = { $exists: false };
        }
        return await this.serverModel.countDocuments(query);
    }

    public async countCreatedAfter(date: Date): Promise<number> {
        return await this.serverModel.countDocuments({
            createdAt: { $gt: date },
        });
    }

    public async countByHour(since: Date, hours: number): Promise<number[]> {
        const msPerHour = 1000 * 60 * 60;
        const buckets = await this.serverModel.aggregate<{
            _id: number;
            count: number;
        }>([
            { $match: { createdAt: { $gte: since } } },
            {
                $group: {
                    _id: {
                        $floor: {
                            $divide: [
                                { $subtract: ['$createdAt', since] },
                                msPerHour,
                            ],
                        },
                    },
                    count: { $sum: 1 },
                },
            },
        ]);
        const result = Array<number>(hours).fill(0);
        for (const b of buckets) {
            const idx = Math.floor(b._id);
            if (idx >= 0 && idx < hours) result[idx] = b.count;
        }
        return result;
    }

    public async countByDay(since: Date, days: number): Promise<number[]> {
        if (days <= 0 || !Number.isFinite(days) || days > 10000) {
            return [];
        }

        const msPerDay = 1000 * 60 * 60 * 24;
        const buckets = await this.serverModel.aggregate<{
            _id: number;
            count: number;
        }>([
            { $match: { createdAt: { $gte: since } } },
            {
                $group: {
                    _id: {
                        $floor: {
                            $divide: [
                                { $subtract: ['$createdAt', since] },
                                msPerDay,
                            ],
                        },
                    },
                    count: { $sum: 1 },
                },
            },
        ]);
        const result = Array<number>(days).fill(0);
        for (const b of buckets) {
            const idx = Math.floor(b._id);
            if (idx >= 0 && idx < days) result[idx] = b.count;
        }
        return result;
    }

    public async countAllByDay(): Promise<number[]> {
        const oldestServer = await this.serverModel
            .findOne()
            .sort({ createdAt: 1 })
            .lean();
        if (!oldestServer) return [];

        const now = new Date();
        const startOfOldestDay = new Date(oldestServer.createdAt);
        startOfOldestDay.setHours(0, 0, 0, 0);

        const diffTime = Math.abs(now.getTime() - startOfOldestDay.getTime());
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return this.countByDay(startOfOldestDay, days);
    }

    public async countAwaitingReview(): Promise<number> {
        return await this.serverModel.countDocuments({
            verificationRequested: true,
            verified: { $ne: true },
            deletedAt: { $exists: false },
        });
    }

    public async listAwaitingReview(options: {
        limit: number;
        offset: number;
    }): Promise<
        (IServer & {
            memberCount?: number;
            realMessageCount?: number;
            weightScore?: number;
        })[]
    > {
        const pipeline: PipelineStage[] = [
            {
                $match: {
                    verificationRequested: true,
                    verified: { $ne: true },
                    deletedAt: { $exists: false },
                },
            },
            {
                $lookup: {
                    from: 'servermembers',
                    localField: 'snowflakeId',
                    foreignField: 'serverId',
                    as: 'members',
                },
            },
            {
                $addFields: {
                    memberCount: { $size: '$members' },
                },
            },
            {
                $lookup: {
                    from: 'servermessages',
                    localField: 'snowflakeId',
                    foreignField: 'serverId',
                    pipeline: [
                        { $match: { isWebhook: { $ne: true } } },
                        { $count: 'realMessageCount' },
                    ],
                    as: 'messagesInfo',
                },
            },
            {
                $addFields: {
                    realMessageCount: {
                        $ifNull: [
                            {
                                $arrayElemAt: [
                                    '$messagesInfo.realMessageCount',
                                    0,
                                ],
                            },
                            0,
                        ],
                    },
                },
            },
            {
                $addFields: {
                    weightScore: {
                        $add: [
                            { $multiply: ['$memberCount', 10] },
                            { $multiply: ['$realMessageCount', 1] },
                        ],
                    },
                },
            },
            { $sort: { weightScore: -1, createdAt: -1 } },
            { $skip: options.offset },
            { $limit: options.limit },
            { $addFields: { id: '$snowflakeId' } },
            { $project: { members: 0, messagesInfo: 0 } },
        ];

        return await this.serverModel.aggregate(pipeline).exec();
    }
}
