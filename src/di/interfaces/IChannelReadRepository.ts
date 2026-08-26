import type { ClientSession } from 'mongoose';

export interface IChannelRead {
    snowflakeId: string;
    userId: string;
    channelId: string;
    lastReadAt: Date;
}

export interface IChannelReadRepository {
    findByUserAndChannel(
        userId: string,
        channelId: string,
    ): Promise<IChannelRead | null>;

    findByUserId(userId: string): Promise<IChannelRead[]>;

    upsert(
        userId: string,
        channelId: string,
        session?: ClientSession,
    ): Promise<IChannelRead>;
}
