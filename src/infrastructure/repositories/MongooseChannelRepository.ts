import { injectable } from 'inversify';
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
        snowflakeId: string;
        serverId: string;
        categoryId?: Types.ObjectId | null;
    };

    return {
        ...d,
        _id: d._id,
        serverId: d.serverId,
        categoryId: d.categoryId ?? null,
    } as IChannel;
};

// Mongoose Channel repository
//
// Implements IChannelRepository using Mongoose Channel model
@injectable()
export class MongooseChannelRepository implements IChannelRepository {
    public async findById(id: string): Promise<IChannel | null> {
        const result = await Channel.findOne({ snowflakeId: id }).lean();
        return transformChannel(result);
    }

    public async findByIdAndServer(
        id: string,
        serverId: string,
    ): Promise<IChannel | null> {
        const result = await Channel.findOne({
            snowflakeId: id,
            serverId,
        }).lean();
        return transformChannel(result);
    }

    public async findByServerId(serverId: string): Promise<IChannel[]> {
        const results = await Channel.find({ serverId })
            .sort({ position: 1 })
            .lean();
        return results
            .map(transformChannel)
            .filter((c): c is IChannel => c !== null);
    }

    public async findByServerIds(serverIds: string[]): Promise<IChannel[]> {
        const results = await Channel.find({
            serverId: { $in: serverIds },
        }).lean();
        return results
            .map(transformChannel)
            .filter((c): c is IChannel => c !== null);
    }

    public async findMaxPositionByServerId(
        serverId: string,
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
        id: string,
        data: Partial<IChannel>,
    ): Promise<IChannel | null> {
        const $set: Record<string, unknown> = {};
        const $unset: Record<string, ''> = {};

        for (const key of Object.keys(data)) {
            const value = (data as Record<string, unknown>)[key];
            if (value === undefined) {
                $unset[key] = '';
            } else {
                $set[key] = value;
            }
        }

        const updateOp: Record<string, unknown> = {};
        if (Object.keys($set).length > 0) updateOp.$set = $set;
        if (Object.keys($unset).length > 0) updateOp.$unset = $unset;

        const result = await Channel.findOneAndUpdate(
            { snowflakeId: id },
            updateOp,
            { new: true },
        ).lean();
        return transformChannel(result);
    }

    public async delete(id: string): Promise<boolean> {
        const result = await Channel.deleteOne({ snowflakeId: id });
        return result.deletedCount > 0;
    }

    public async updatePosition(
        id: string,
        position: number,
    ): Promise<IChannel | null> {
        const result = await Channel.findOneAndUpdate(
            { snowflakeId: id },
            { position },
            { new: true },
        ).lean();
        return transformChannel(result);
    }

    public async updateLastMessageAt(
        id: string,
        date: Date = new Date(),
        session?: ClientSession,
    ): Promise<IChannel | null> {
        const result = await Channel.findOneAndUpdate(
            { snowflakeId: id },
            { lastMessageAt: date },
            { new: true, session },
        ).lean();
        return transformChannel(result);
    }

    public async deleteByServerId(serverId: string): Promise<number> {
        const result = await Channel.deleteMany({ serverId });
        return result.deletedCount;
    }

    public async updateChannelsInCategory(
        categoryId: string,
        updates: Partial<IChannel>,
    ): Promise<boolean> {
        const result = await Channel.updateMany({ categoryId }, updates);
        return result.modifiedCount > 0;
    }
}
