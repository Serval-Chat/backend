import type { Types } from 'mongoose';

// Ping interface (domain model)
//
// Represents a notification (mention) for a user
export interface IPing {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    type: 'mention';
    sender: string;
    senderId: Types.ObjectId;
    serverId?: Types.ObjectId;
    channelId?: Types.ObjectId;
    messageId: Types.ObjectId;
    message: Record<string, unknown>;
    timestamp: Date;
    createdAt?: Date;
}

// Ping Repository Interface
//
// Encapsulates all ping-related database operations
export interface IPingRepository {
    // Find ping by ID
    findById(id: Types.ObjectId): Promise<IPing | null>;

    // Find all pings for a user (with optional age filter)
    findByUserId(userId: Types.ObjectId, maxAge?: number): Promise<IPing[]>;

    // Create a new ping
    create(data: {
        userId: Types.ObjectId;
        type: 'mention';
        sender: string;
        senderId: Types.ObjectId;
        serverId?: Types.ObjectId;
        channelId?: Types.ObjectId;
        messageId: Types.ObjectId;
        message: Record<string, unknown>;
        timestamp?: Date;
    }): Promise<IPing>;

    // Check if a ping already exists (for deduplication)
    exists(
        userId: Types.ObjectId,
        senderId: Types.ObjectId,
        messageId: Types.ObjectId,
    ): Promise<boolean>;

    // Delete a specific ping by ID
    delete(id: Types.ObjectId): Promise<boolean>;

    // Delete all pings for a specific channel
    deleteByChannelId(
        userId: Types.ObjectId,
        channelId: Types.ObjectId,
    ): Promise<number>;

    deleteByServerId(
        userId: Types.ObjectId,
        serverId: Types.ObjectId,
    ): Promise<number>;

    // Delete all pings for a user
    deleteByUserId(userId: Types.ObjectId): Promise<number>;

    // Delete old pings (older than specified age)
    deleteOldPings(maxAge: number): Promise<number>;
}
