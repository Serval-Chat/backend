import { injectable } from 'inversify';
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
    implements IServerChannelReadRepository {
    async findByServerAndUser(
        serverId: string,
        userId: string,
    ): Promise<IServerChannelRead[]> {
        return (await ServerChannelRead.find({
            serverId,
            userId,
        }).lean()) as unknown as IServerChannelRead[];
    }

    async findByUserId(userId: string): Promise<IServerChannelRead[]> {
        return (await ServerChannelRead.find({
            userId,
        }).lean()) as unknown as IServerChannelRead[];
    }

    // Update or create a read record for a channel
    //
    // Sets the 'lastReadAt' timestamp to the current time
    // Uses upsert to ensure the record exists
    async upsert(
        serverId: string,
        channelId: string,
        userId: string,
    ): Promise<IServerChannelRead> {
        const result = (await ServerChannelRead.findOneAndUpdate(
            { serverId, channelId, userId },
            { lastReadAt: new Date() },
            { new: true, upsert: true },
        ).lean()) as unknown as IServerChannelRead;

        // Handle the case where lean() might return null
        if (!result) {
            throw new Error(ErrorMessages.SERVER.FAILED_UPSERT_READ);
        }

        return result;
    }

    // Mark all channels in a server as read for a user
    async markServerAsRead(serverId: string, userId: string): Promise<void> {
        await ServerChannelRead.updateMany(
            { serverId, userId },
            { $set: { lastReadAt: new Date() } },
        );
    }
}
