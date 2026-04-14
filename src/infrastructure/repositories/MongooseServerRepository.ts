import { Injectable } from '@nestjs/common';
import { Types, type PipelineStage } from 'mongoose';
import type { FilterQuery } from 'mongoose';
import {
    IServerRepository,
    IServer,
    CreateServerDTO,
} from '@/di/interfaces/IServerRepository';
import { Server } from '@/models/Server';
import { injectable } from 'inversify';

// Mongoose Server repository
//
// Implements IServerRepository using Mongoose Server model
@injectable()
@Injectable()
export class MongooseServerRepository implements IServerRepository {
    private serverModel = Server;
    constructor() {}

    async findById(
        id: Types.ObjectId,
        includeDeleted: boolean = false,
    ): Promise<IServer | null> {
        const query: FilterQuery<IServer> = { _id: id };
        if (!includeDeleted) {
            query.deletedAt = { $exists: false };
        }
        return await this.serverModel.findOne(query).lean();
    }

    async findByIds(ids: Types.ObjectId[]): Promise<IServer[]> {
        return await this.serverModel
            .find({
                _id: { $in: ids },
                deletedAt: { $exists: false },
            })
            .lean();
    }

    async findByOwnerId(ownerId: Types.ObjectId): Promise<IServer[]> {
        return await this.serverModel
            .find({
                ownerId,
                deletedAt: { $exists: false },
            })
            .lean();
    }

    async create(data: CreateServerDTO): Promise<IServer> {
        const server = new this.serverModel(data);
        return await server.save();
    }

    async update(
        id: Types.ObjectId,
        data: Partial<IServer>,
    ): Promise<IServer | null> {
        return await this.serverModel
            .findOneAndUpdate(
                { _id: id, deletedAt: { $exists: false } },
                data,
                { new: true },
            )
            .lean();
    }

    async delete(id: Types.ObjectId): Promise<boolean> {
        const result = await this.serverModel.deleteOne({ _id: id });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }

    // Soft delete a server
    //
    // Marks the server as deleted by setting 'deletedAt' timestamp
    async softDelete(id: Types.ObjectId): Promise<boolean> {
        const result = await this.serverModel.updateOne(
            { _id: id },
            { $set: { deletedAt: new Date() } },
        );
        return result.modifiedCount > 0;
    }

    // Restore a soft-deleted server
    async restore(id: Types.ObjectId): Promise<boolean> {
        const result = await this.serverModel.updateOne(
            { _id: id },
            { $unset: { deletedAt: 1 } },
        );
        return result.modifiedCount > 0;
    }

    async clearDefaultRole(
        serverId: Types.ObjectId,
        roleId: Types.ObjectId,
    ): Promise<boolean> {
        const result = await this.serverModel.updateOne(
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
        const query: FilterQuery<IServer> = {};

        if (!options.includeDeleted) {
            query.deletedAt = { $exists: false };
        }

        if (options.search) {
            query.$or = [
                { name: { $regex: options.search, $options: 'i' } },
                { _id: options.search }, // Exact match for ID
            ];
        }
        return await this.serverModel
            .find(query)
            .skip(options.offset)
            .limit(options.limit)
            .sort({ createdAt: -1 })
            .lean();
    }

    async count(includeDeleted: boolean = false): Promise<number> {
        const query: FilterQuery<IServer> = {};
        if (!includeDeleted) {
            query.deletedAt = { $exists: false };
        }
        return await this.serverModel.countDocuments(query);
    }

    async countCreatedAfter(date: Date): Promise<number> {
        return await this.serverModel.countDocuments({
            createdAt: { $gt: date },
        });
    }

    async countByHour(since: Date, hours: number): Promise<number[]> {
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

    async countByDay(since: Date, days: number): Promise<number[]> {
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

    async countAllByDay(): Promise<number[]> {
        const oldestServer = await this.serverModel
            .findOne()
            .sort({ createdAt: 1 })
            .lean();
        if (!oldestServer || !oldestServer.createdAt) return [];

        const now = new Date();
        const startOfOldestDay = new Date(oldestServer.createdAt);
        startOfOldestDay.setHours(0, 0, 0, 0);

        const diffTime = Math.abs(now.getTime() - startOfOldestDay.getTime());
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return this.countByDay(startOfOldestDay, days);
    }

    async countAwaitingReview(): Promise<number> {
        return await this.serverModel.countDocuments({
            verificationRequested: true,
            verified: { $ne: true },
            deletedAt: { $exists: false }
        });
    }

    async listAwaitingReview(options: {
        limit: number;
        offset: number;
    }): Promise<(IServer & { memberCount?: number; realMessageCount?: number; weightScore?: number })[]> {
        const pipeline: PipelineStage[] = [
            { 
                $match: { 
                    verificationRequested: true, 
                    verified: { $ne: true }, 
                    deletedAt: { $exists: false } 
                } 
            },
            {
                $lookup: {
                    from: 'servermembers',
                    localField: '_id',
                    foreignField: 'serverId',
                    as: 'members'
                }
            },
            {
                $addFields: {
                    memberCount: { $size: "$members" }
                }
            },
            {
                $lookup: {
                    from: 'servermessages',
                    localField: '_id',
                    foreignField: 'serverId',
                    pipeline: [
                        { $match: { isWebhook: { $ne: true } } },
                        { $count: "realMessageCount" }
                    ],
                    as: "messagesInfo"
                }
            },
            {
                $addFields: {
                    realMessageCount: { 
                        $ifNull: [ { $arrayElemAt: ["$messagesInfo.realMessageCount", 0] }, 0 ] 
                    }
                }
            },
            {
                $addFields: {
                    weightScore: { 
                        $add: [
                            { $multiply: ["$memberCount", 10] },
                            { $multiply: ["$realMessageCount", 1] }
                        ]
                    }
                }
            },
            { $sort: { weightScore: -1, createdAt: -1 } },
            { $skip: options.offset },
            { $limit: options.limit },
            { $project: { members: 0, messagesInfo: 0 } }
        ];

        return await this.serverModel.aggregate(pipeline).exec();
    }
}
