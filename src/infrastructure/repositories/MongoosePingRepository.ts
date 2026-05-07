import { Injectable } from '@nestjs/common';
import { injectable } from 'inversify';
import { IPingRepository, IPing } from '@/di/interfaces/IPingRepository';
import { Ping } from '@/models/Ping';
import { type FilterQuery, Types } from 'mongoose';
import {
    PingMentionMessageDTO,
    PingExportMessageDTO,
} from '@/controllers/dto/types.dto';

// Mongoose Ping repository
//
// Implements IPingRepository using Mongoose Ping model
// Encapsulates all ping operations
@injectable()
@Injectable()
export class MongoosePingRepository implements IPingRepository {
    public async findById(id: Types.ObjectId): Promise<IPing | null> {
        return (await Ping.findById(id).lean()) as unknown as IPing | null;
    }

    public async findByUserId(
        userId: Types.ObjectId,
        maxAge?: number,
    ): Promise<IPing[]> {
        const query: FilterQuery<IPing> = {
            userId,
        };

        // Filter out old pings if maxAge is specified (in milliseconds)
        if (maxAge !== undefined && maxAge > 0) {
            const cutoffDate = new Date(Date.now() - maxAge);
            query.timestamp = { $gte: cutoffDate };
        }

        return (await Ping.find(query)
            .sort({ timestamp: -1 })
            .lean()) as unknown as IPing[];
    }

    public async create(data: {
        userId: Types.ObjectId;
        type: 'mention' | 'export_status';
        sender: string;
        senderId: Types.ObjectId;
        serverId?: Types.ObjectId;
        channelId?: Types.ObjectId;
        messageId: Types.ObjectId;
        message: PingMentionMessageDTO | PingExportMessageDTO;
        timestamp?: Date;
    }): Promise<IPing> {
        const pingData = {
            userId: data.userId,
            type: data.type,
            sender: data.sender,
            senderId: data.senderId,
            messageId: data.messageId,
            message: data.message,
            timestamp: data.timestamp ?? new Date(),

            ...(data.serverId && {
                serverId: data.serverId,
            }),
            ...(data.channelId && {
                channelId: data.channelId,
            }),
        };

        const ping = await Ping.findOneAndUpdate(
            {
                userId: pingData.userId,
                senderId: pingData.senderId,
                messageId: pingData.messageId,
            },
            {
                $setOnInsert: pingData,
            },
            {
                upsert: true,
                new: true,
                lean: true,
            },
        );

        return ping as unknown as IPing;
    }

    public async exists(
        userId: Types.ObjectId,
        senderId: Types.ObjectId,
        messageId: Types.ObjectId,
    ): Promise<boolean> {
        const count = await Ping.countDocuments({
            userId,
            senderId,
            messageId,
        });
        return count > 0;
    }

    public async delete(id: Types.ObjectId): Promise<boolean> {
        const result = await Ping.deleteOne({ _id: id });
        return result.deletedCount > 0;
    }

    public async deleteByChannelId(
        userId: Types.ObjectId,
        channelId: Types.ObjectId,
    ): Promise<number> {
        const result = await Ping.deleteMany({
            userId,
            channelId,
        });
        return result.deletedCount;
    }

    public async deleteByServerId(
        userId: Types.ObjectId,
        serverId: Types.ObjectId,
    ): Promise<number> {
        const result = await Ping.deleteMany({
            userId,
            serverId,
        });
        return result.deletedCount;
    }

    public async deleteByUserId(userId: Types.ObjectId): Promise<number> {
        const result = await Ping.deleteMany({
            userId,
        });
        return result.deletedCount;
    }

    public async deleteOldPings(maxAge: number): Promise<number> {
        const cutoffDate = new Date(Date.now() - maxAge);
        const result = await Ping.deleteMany({
            timestamp: { $lt: cutoffDate },
        });
        return result.deletedCount;
    }
}
