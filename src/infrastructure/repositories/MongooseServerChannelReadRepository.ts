import { injectable } from 'inversify';
import { Types } from 'mongoose';
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
        serverId: Types.ObjectId,
        userId: Types.ObjectId,
    ): Promise<IServerChannelRead[]> {
        return (await ServerChannelRead.find({
            serverId,
            userId,
        }).lean()) as unknown as IServerChannelRead[];
    }

    public async findByUserId(userId: Types.ObjectId): Promise<IServerChannelRead[]> {
        return (await ServerChannelRead.find({
            userId,
        }).lean()) as unknown as IServerChannelRead[];
    }

    // Update or create a read record for a channel
    public async upsert(
        serverId: Types.ObjectId,
        channelId: Types.ObjectId,
        userId: Types.ObjectId,
        session?: ClientSession,
    ): Promise<IServerChannelRead> {
        const result = (await ServerChannelRead.findOneAndUpdate(
            { serverId, channelId, userId },
            { lastReadAt: new Date() },
            { new: true, upsert: true, session },
        ).lean()) as unknown as IServerChannelRead | null;

        if (result === null) {
            throw new Error(ErrorMessages.SERVER.FAILED_UPSERT_READ);
        }

        return result;
    }

    // Mark all channels in a server as read for a user
    public async markServerAsRead(
        serverId: Types.ObjectId,
        userId: Types.ObjectId,
    ): Promise<void> {
        await ServerChannelRead.updateMany(
            { serverId, userId },
            { $set: { lastReadAt: new Date() } },
        );
    }
}
