import { injectable } from 'inversify';
import { IPingRepository, IPing } from '@/di/interfaces/IPingRepository';
import { Ping } from '@/models/Ping';
import { Types } from 'mongoose';

/**
 * Mongoose Ping Repository
 *
 * Implements IPingRepository using Mongoose Ping model.
 * Encapsulates all ping operations.
 */
@injectable()
export class MongoosePingRepository implements IPingRepository {
    async findById(id: string): Promise<IPing | null> {
        return await Ping.findById(id).lean();
    }

    async findByUserId(userId: string, maxAge?: number): Promise<IPing[]> {
        const query: any = { userId: new Types.ObjectId(userId) };

        // Filter out old pings if maxAge is specified (in milliseconds)
        if (maxAge) {
            const cutoffDate = new Date(Date.now() - maxAge);
            query.timestamp = { $gte: cutoffDate };
        }

        return await Ping.find(query).sort({ timestamp: -1 }).lean();
    }

    async create(data: {
        userId: string;
        type: 'mention';
        sender: string;
        senderId: string;
        serverId?: string;
        channelId?: string;
        messageId: string;
        message: any;
        timestamp?: Date;
    }): Promise<IPing> {
        const pingData = {
            userId: new Types.ObjectId(data.userId),
            type: data.type,
            sender: data.sender,
            senderId: new Types.ObjectId(data.senderId),
            messageId: new Types.ObjectId(data.messageId),
            message: data.message,
            timestamp: data.timestamp ?? new Date(),

            ...(data.serverId && {
                serverId: new Types.ObjectId(data.serverId),
            }),
            ...(data.channelId && {
                channelId: new Types.ObjectId(data.channelId),
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

        return ping!;
    }

    async exists(
        userId: string,
        senderId: string,
        messageId: string,
    ): Promise<boolean> {
        const count = await Ping.countDocuments({
            userId: new Types.ObjectId(userId),
            senderId: new Types.ObjectId(senderId),
            messageId: new Types.ObjectId(messageId),
        });
        return count > 0;
    }

    async delete(id: string): Promise<boolean> {
        const result = await Ping.deleteOne({ _id: id });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }

    async deleteByChannelId(
        userId: string,
        channelId: string,
    ): Promise<number> {
        const result = await Ping.deleteMany({
            userId: new Types.ObjectId(userId),
            channelId: new Types.ObjectId(channelId),
        });
        return result.deletedCount || 0;
    }

    async deleteByUserId(userId: string): Promise<number> {
        const result = await Ping.deleteMany({
            userId: new Types.ObjectId(userId),
        });
        return result.deletedCount || 0;
    }

    async deleteOldPings(maxAge: number): Promise<number> {
        const cutoffDate = new Date(Date.now() - maxAge);
        const result = await Ping.deleteMany({
            timestamp: { $lt: cutoffDate },
        });
        return result.deletedCount || 0;
    }
}
