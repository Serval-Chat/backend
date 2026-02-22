import type { Types, ClientSession } from 'mongoose';

// Server Channel Read interface (domain model)
//
// Tracks when a user last read a specific channel in a server
// Used to calculate unread message indicators
export interface IServerChannelRead {
    _id: Types.ObjectId;
    serverId: Types.ObjectId;
    channelId: Types.ObjectId;
    userId: Types.ObjectId;
    // Timestamp of the last time the user viewed the channel
    lastReadAt: Date;
}

// Server Channel Read Repository Interface
//
// Encapsulates server channel read tracking operations
export interface IServerChannelReadRepository {
    // Find all read records for a user in a server
    findByServerAndUser(
        serverId: Types.ObjectId,
        userId: Types.ObjectId,
    ): Promise<IServerChannelRead[]>;

    // Find all read records for a user across all servers/channels
    findByUserId(userId: Types.ObjectId): Promise<IServerChannelRead[]>;

    // Upsert (create or update) a read record
    upsert(
        serverId: Types.ObjectId,
        channelId: Types.ObjectId,
        userId: Types.ObjectId,
        session?: ClientSession,
    ): Promise<IServerChannelRead>;
}
