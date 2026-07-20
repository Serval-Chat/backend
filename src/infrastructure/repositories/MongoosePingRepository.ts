import { injectable } from 'inversify';
import { IPingRepository, IPing } from '@/di/interfaces/IPingRepository';
import { Ping } from '@/models/Ping';
import {
    PingMentionMessageDTO,
    PingExportMessageDTO,
} from '@/controllers/dto/types.dto';

// Mongoose Ping repository
//
// Implements IPingRepository using Mongoose Ping model
// Encapsulates all ping operations
@injectable()
export class MongoosePingRepository implements IPingRepository {
    public async findById(id: string): Promise<IPing | null> {
        return (await Ping.findOne({
            snowflakeId: id,
        }).lean()) as IPing | null;
    }

    public async findByUserId(
        userId: string,
        maxAge?: number,
    ): Promise<IPing[]> {
        const query: { userId: string; timestamp?: { $gte: Date } } = {
            userId,
        };

        // Filter out old pings if maxAge is specified (in milliseconds)
        if (maxAge !== undefined && maxAge > 0) {
            const cutoffDate = new Date(Date.now() - maxAge);
            query.timestamp = { $gte: cutoffDate };
        }

        const pingDocs: unknown = await Ping.find(query)
            .sort({ timestamp: -1 })
            .lean();
        return pingDocs as IPing[];
    }

    public async create(data: {
        userId: string;
        type: 'mention' | 'export_status';
        sender: string;
        senderId: string;
        serverId?: string;
        channelId?: string;
        messageId: string;
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

            ...(data.serverId !== undefined &&
                data.serverId !== '' && {
                    serverId: data.serverId,
                }),
            ...(data.channelId !== undefined &&
                data.channelId !== '' && {
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
                returnDocument: 'after',
                lean: true,
            },
        );

        const pingUnknown: unknown = ping;
        return pingUnknown as IPing;
    }

    public async exists(
        userId: string,
        senderId: string,
        messageId: string,
    ): Promise<boolean> {
        const count = await Ping.countDocuments({
            userId,
            senderId,
            messageId,
        });
        return count > 0;
    }

    public async delete(id: string): Promise<boolean> {
        const result = await Ping.deleteOne({ snowflakeId: id });
        return result.deletedCount > 0;
    }

    public async deleteByChannelId(
        userId: string,
        channelId: string,
    ): Promise<number> {
        const result = await Ping.deleteMany({
            userId,
            channelId,
        });
        return result.deletedCount;
    }

    public async deleteByServerId(
        userId: string,
        serverId: string,
    ): Promise<number> {
        const result = await Ping.deleteMany({
            userId,
            serverId,
        });
        return result.deletedCount;
    }

    public async deleteByUserId(userId: string): Promise<number> {
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

    public async deleteBetweenUsers(
        user1: string,
        user2: string,
    ): Promise<number> {
        const result = await Ping.deleteMany({
            $or: [
                { userId: user1, senderId: user2 },
                { userId: user2, senderId: user1 },
            ],
            serverId: { $exists: false },
        });
        return result.deletedCount;
    }
}
