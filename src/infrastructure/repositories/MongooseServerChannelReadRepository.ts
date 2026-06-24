import { injectable } from 'inversify';
import type { ClientSession } from 'mongoose';
import {
    IServerChannelReadRepository,
    IServerChannelRead,
} from '@/di/interfaces/IServerChannelReadRepository';
import { ServerChannelRead } from '@/models/ServerChannelRead';
import { ErrorMessages } from '@/constants/errorMessages';

// Mongoose Server Channel Read repository
//
// Implements IServerChannelReadRepository using Mongoose ServerChannelRead model
@injectable()
export class MongooseServerChannelReadRepository
    implements IServerChannelReadRepository
{
    public async findByServerAndUser(
        serverId: string,
        userId: string,
    ): Promise<IServerChannelRead[]> {
        return await ServerChannelRead.find({
            serverId,
            userId,
        }).lean();
    }

    public async findByUserId(userId: string): Promise<IServerChannelRead[]> {
        return await ServerChannelRead.find({
            userId,
        }).lean();
    }

    // Update or create a read record for a channel
    public async upsert(
        serverId: string,
        channelId: string,
        userId: string,
        session?: ClientSession,
    ): Promise<IServerChannelRead> {
        const result = (await ServerChannelRead.findOneAndUpdate(
            {
                serverId,
                channelId,
                userId,
            },
            { lastReadAt: new Date() },
            { new: true, upsert: true, session },
        ).lean()) as IServerChannelRead | null;

        if (result === null) {
            throw new Error(ErrorMessages.SERVER.FAILED_UPSERT_READ);
        }

        return result;
    }

    // Mark all channels in a server as read for a user
    public async markServerAsRead(
        serverId: string,
        userId: string,
    ): Promise<void> {
        await ServerChannelRead.updateMany(
            { serverId, userId },
            { $set: { lastReadAt: new Date() } },
        );
    }
}
