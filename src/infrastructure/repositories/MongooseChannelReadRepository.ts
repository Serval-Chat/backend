import { injectable } from 'inversify';
import type { ClientSession } from 'mongoose';
import {
    IChannelReadRepository,
    IChannelRead,
} from '@/di/interfaces/IChannelReadRepository';
import { ChannelRead } from '@/models/ChannelRead';
import { ErrorMessages } from '@/constants/errorMessages';

@injectable()
export class MongooseChannelReadRepository implements IChannelReadRepository {
    public async findByUserAndChannel(
        userId: string,
        channelId: string,
    ): Promise<IChannelRead | null> {
        return await ChannelRead.findOne({ userId, channelId }).lean();
    }

    public async findByUserId(userId: string): Promise<IChannelRead[]> {
        return await ChannelRead.find({ userId }).lean();
    }

    public async upsert(
        userId: string,
        channelId: string,
        session?: ClientSession,
    ): Promise<IChannelRead> {
        const result = (await ChannelRead.findOneAndUpdate(
            { userId, channelId },
            { lastReadAt: new Date() },
            { returnDocument: 'after', upsert: true, session },
        ).lean()) as IChannelRead | null;

        if (result === null) {
            throw new Error(ErrorMessages.SERVER.FAILED_UPSERT_READ);
        }

        return result;
    }
}
