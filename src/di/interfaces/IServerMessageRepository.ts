import type { Types, ClientSession } from 'mongoose';

// Server Message interface (domain model)
//
// Represents a message sent within a server channel
export interface IServerMessage {
    _id: Types.ObjectId;
    serverId: Types.ObjectId;
    channelId: Types.ObjectId;
    senderId: Types.ObjectId;
    text: string;
    createdAt: Date;
    replyToId?: Types.ObjectId;
    repliedToMessageId?: Types.ObjectId;
    referenced_message?: IServerMessage;
    editedAt?: Date;
    isEdited?: boolean;
    isPinned?: boolean;
    isSticky?: boolean;
    isWebhook?: boolean;
    webhookUsername?: string;
    webhookAvatarUrl?: string;
    reactions?: unknown[];
}

// Server Message Repository Interface
//
// Encapsulates server message operations
export interface IServerMessageRepository {
    // Create a new server message
    create(
        data: {
            serverId: Types.ObjectId;
            channelId: Types.ObjectId;
            senderId: Types.ObjectId;
            text: string;
            isWebhook?: boolean;
            webhookUsername?: string;
            webhookAvatarUrl?: string;
            replyToId?: Types.ObjectId;
            repliedToMessageId?: Types.ObjectId;
        },
        session?: ClientSession,
    ): Promise<IServerMessage>;

    // Delete message by ID
    delete(id: Types.ObjectId): Promise<boolean>;

    // Delete all messages for a server (bulk delete)
    deleteByServerId(serverId: Types.ObjectId): Promise<number>;

    // Delete all messages for a channel (bulk delete)
    deleteByChannelId(channelId: Types.ObjectId): Promise<number>;

    // Find message by ID
    findById(id: Types.ObjectId): Promise<IServerMessage | null>;

    // Update a server message
    update(
        id: Types.ObjectId,
        data: Partial<IServerMessage>,
    ): Promise<IServerMessage | null>;

    // Find messages by channel ID with pagination
    findByChannelId(
        channelId: Types.ObjectId,
        limit?: number,
        before?: string,
        around?: string,
        after?: string,
    ): Promise<IServerMessage[]>;

    findCursorByChannelId(
        channelId: Types.ObjectId,
    ): AsyncIterable<IServerMessage>;

    // Count messages in a channel
    countByChannelId(channelId: Types.ObjectId): Promise<number>;

    // Count messages in a server
    countByServerId(serverId: Types.ObjectId): Promise<number>;

    // Find last message by channel and user
    findLastByChannelAndUser(
        channelId: Types.ObjectId,
        userId: Types.ObjectId,
    ): Promise<IServerMessage | null>;
    // Find all pinned messages in a channel
    findPinnedByChannelId(channelId: Types.ObjectId): Promise<IServerMessage[]>;

    // Count total keys
    count(): Promise<number>;

    // Count messages created after a certain date
    countCreatedAfter(date: Date): Promise<number>;

    // Count server messages per hour for the last N hours (oldest-first array)
    countByHour(since: Date, hours: number): Promise<number[]>;

    // Count server messages per day for the last N days (oldest-first array)
    countByDay(since: Date, days: number): Promise<number[]>;

    // Count all server messages per day since the very first message (lifetime view)
    countAllByDay(): Promise<number[]>;
}
