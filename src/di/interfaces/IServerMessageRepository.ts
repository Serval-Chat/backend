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

    findCursorByChannelId(channelId: Types.ObjectId): AsyncIterable<IServerMessage>;

    // Count messages in a channel
    countByChannelId(channelId: Types.ObjectId): Promise<number>;
}
