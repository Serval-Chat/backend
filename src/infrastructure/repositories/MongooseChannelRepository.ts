import { injectable } from 'inversify';
import { Injectable } from '@nestjs/common';
import type { ClientSession, Types } from 'mongoose';
import {
    IChannelRepository,
    IChannel,
    CreateChannelDTO,
} from '@/di/interfaces/IChannelRepository';
import { Channel } from '@/models/Server';

// Transform MongoDB document to match IChannel interface
const transformChannel = (doc: unknown): IChannel | null => {
    if (doc === null) return null;

    const d = doc as {
        _id: Types.ObjectId;
        serverId: Types.ObjectId;
        categoryId?: Types.ObjectId | null;
    };

    return {
        ...d,
        _id: d._id,
        serverId: d.serverId,
        categoryId: d.categoryId ?? null,
    } as unknown as IChannel;
};

// Mongoose Channel repository
//
// Implements IChannelRepository using Mongoose Channel model
@injectable()
@Injectable()
export class MongooseChannelRepository implements IChannelRepository {
    public async findById(id: Types.ObjectId): Promise<IChannel | null> {
        const result = await Channel.findById(id).lean();
        return transformChannel(result);
    }

    public async findByIdAndServer(
        id: Types.ObjectId,
        serverId: Types.ObjectId,
    ): Promise<IChannel | null> {
        const result = await Channel.findOne({ _id: id, serverId }).lean();
        return transformChannel(result);
    }

    public async findByServerId(serverId: Types.ObjectId): Promise<IChannel[]> {
        const results = await Channel.find({ serverId })
            .sort({ position: 1 })
            .lean();
        return results.map(transformChannel).filter((c): c is IChannel => c !== null) as IChannel[];
    }

    public async findByServerIds(serverIds: Types.ObjectId[]): Promise<IChannel[]> {
        const results = await Channel.find({
            serverId: { $in: serverIds },
        }).lean();
        return results.map(transformChannel).filter((c): c is IChannel => c !== null) as IChannel[];
    }

    public async findMaxPositionByServerId(
        serverId: Types.ObjectId,
    ): Promise<IChannel | null> {
        const result = await Channel.findOne({ serverId })
            .sort({ position: -1 })
            .lean();
        return transformChannel(result);
    }

    public async create(data: CreateChannelDTO): Promise<IChannel> {
        const channel = new Channel(data);
        const result = await channel.save();
        const transformed = transformChannel(result.toObject());
        if (transformed === null) throw new Error('Failed to create channel');
        return transformed;
    }

    public async update(
        id: Types.ObjectId,
        data: Partial<IChannel>,
    ): Promise<IChannel | null> {
        const result = await Channel.findByIdAndUpdate(id, data, {
            new: true,
        }).lean();
        return transformChannel(result);
    }

    public async delete(id: Types.ObjectId): Promise<boolean> {
        const result = await Channel.deleteOne({ _id: id });
        return result.deletedCount > 0;
    }

    public async updatePosition(
        id: Types.ObjectId,
        position: number,
    ): Promise<IChannel | null> {
        const result = await Channel.findByIdAndUpdate(
            id,
            { position },
            { new: true },
        ).lean();
        return transformChannel(result);
    }

    public async updateLastMessageAt(
        id: Types.ObjectId,
        date: Date = new Date(),
        session?: ClientSession,
    ): Promise<IChannel | null> {
        const result = await Channel.findByIdAndUpdate(
            id,
            { lastMessageAt: date },
            { new: true, session },
        ).lean();
        return transformChannel(result);
    }

    public async deleteByServerId(serverId: Types.ObjectId): Promise<number> {
        const result = await Channel.deleteMany({ serverId });
        return result.deletedCount;
    }

    public async updateChannelsInCategory(
        categoryId: Types.ObjectId,
        updates: Partial<IChannel>,
    ): Promise<boolean> {
        const result = await Channel.updateMany({ categoryId }, updates);
        return result.modifiedCount > 0;
    }
}
