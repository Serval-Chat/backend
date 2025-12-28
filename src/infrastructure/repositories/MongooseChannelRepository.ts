import { injectable } from 'inversify';
import {
    IChannelRepository,
    IChannel,
    CreateChannelDTO,
} from '@/di/interfaces/IChannelRepository';
import { Channel } from '@/models/Server';
import mongoose from 'mongoose';

/**
 * Transform MongoDB document to match IChannel interface.
 *
 * Ensures that ObjectIds are converted to strings and categoryId is handled.
 */
const transformChannel = (doc: any): IChannel | null => {
    if (!doc) return null;

    return {
        ...doc,
        _id: doc._id.toString(),
        serverId: doc.serverId.toString(),
        categoryId: doc.categoryId ? doc.categoryId.toString() : null,
    };
};

/**
 * Mongoose Channel Repository
 *
 * Implements IChannelRepository using Mongoose Channel model.
 */
@injectable()
export class MongooseChannelRepository implements IChannelRepository {
    async findById(id: string): Promise<IChannel | null> {
        const result = await Channel.findById(id).lean();
        return transformChannel(result);
    }

    async findByIdAndServer(
        id: string,
        serverId: string,
    ): Promise<IChannel | null> {
        const result = await Channel.findOne({ _id: id, serverId }).lean();
        return transformChannel(result);
    }

    async findByServerId(serverId: string): Promise<IChannel[]> {
        const results = await Channel.find({ serverId })
            .sort({ position: 1 })
            .lean();
        return results.map(transformChannel).filter(Boolean) as IChannel[];
    }

    async findByServerIds(serverIds: string[]): Promise<IChannel[]> {
        const results = await Channel.find({
            serverId: { $in: serverIds },
        }).lean();
        return results.map(transformChannel).filter(Boolean) as IChannel[];
    }

    async findMaxPositionByServerId(
        serverId: string,
    ): Promise<IChannel | null> {
        const result = await Channel.findOne({ serverId })
            .sort({ position: -1 })
            .lean();
        return transformChannel(result);
    }

    async create(data: CreateChannelDTO): Promise<IChannel> {
        const channel = new Channel(data);
        const result = await channel.save();
        return transformChannel(result.toObject())!;
    }

    async update(
        id: string,
        data: Partial<IChannel>,
    ): Promise<IChannel | null> {
        const result = await Channel.findByIdAndUpdate(id, data, {
            new: true,
        }).lean();
        return transformChannel(result);
    }

    async delete(id: string): Promise<boolean> {
        const result = await Channel.deleteOne({ _id: id });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }

    async updatePosition(
        id: string,
        position: number,
    ): Promise<IChannel | null> {
        const result = await Channel.findByIdAndUpdate(
            id,
            { position },
            { new: true },
        ).lean();
        return transformChannel(result);
    }

    async updateLastMessageAt(
        id: string,
        date: Date = new Date(),
    ): Promise<IChannel | null> {
        const result = await Channel.findByIdAndUpdate(
            id,
            { lastMessageAt: date },
            { new: true },
        ).lean();
        return transformChannel(result);
    }

    async deleteByServerId(serverId: string): Promise<number> {
        const result = await Channel.deleteMany({ serverId });
        return result.deletedCount || 0;
    }

    async updateChannelsInCategory(
        categoryId: string,
        updates: Partial<IChannel>,
    ): Promise<boolean> {
        const result = await Channel.updateMany({ categoryId }, updates);
        return result.modifiedCount ? result.modifiedCount > 0 : false;
    }
}
