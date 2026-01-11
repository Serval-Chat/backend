import type { Types, ClientSession } from 'mongoose';

// Server Message interface (domain model)
//
// Represents a message sent within a server channel
export interface IServerMessage {
    _id: Types.ObjectId | string;
    serverId: Types.ObjectId | string;
    channelId: Types.ObjectId | string;
    senderId: Types.ObjectId | string;
    text: string;
    createdAt: Date;
    replyToId?: Types.ObjectId | string;
    repliedToMessageId?: Types.ObjectId;
    editedAt?: Date;
    isEdited?: boolean;
    // Flag indicating if the message was sent via a webhook
    isWebhook?: boolean;
    // Overridden username for webhook messages
    webhookUsername?: string;
    // Overridden avatar URL for webhook messages
    webhookAvatarUrl?: string;
    // List of emoji reactions on the message
    reactions?: unknown[];
}

// Server Message Repository Interface
//
// Encapsulates server message operations
export interface IServerMessageRepository {
    // Create a new server message
    create(
        data: {
            serverId: string | Types.ObjectId;
            channelId: string | Types.ObjectId;
            senderId: string | Types.ObjectId;
            text: string;
            isWebhook?: boolean | undefined;
            webhookUsername?: string | undefined;
            webhookAvatarUrl?: string | undefined;
            replyToId?: string | Types.ObjectId | undefined;
            repliedToMessageId?: Types.ObjectId | undefined;
        },
        session?: ClientSession,
    ): Promise<IServerMessage>;

    // Delete message by ID
    delete(id: string): Promise<boolean>;

    // Delete all messages for a server (bulk delete)
    deleteByServerId(serverId: Types.ObjectId | string): Promise<number>;

    // Delete all messages for a channel (bulk delete)
    deleteByChannelId(channelId: string): Promise<number>;

    // Find message by ID
    findById(id: string): Promise<IServerMessage | null>;

    // Update a server message
    update(
        id: string,
        data: Partial<IServerMessage>,
    ): Promise<IServerMessage | null>;

    // Find messages by channel ID with pagination
    findByChannelId(
        channelId: string,
        limit?: number,
        before?: string,
        around?: string,
    ): Promise<IServerMessage[]>;

    // Count messages in a channel
    countByChannelId(channelId: string): Promise<number>;
}
