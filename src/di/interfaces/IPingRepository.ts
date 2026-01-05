import type { Types } from 'mongoose';

// Ping interface (domain model)
//
// Represents a notification (mention) for a user
export interface IPing {
    _id: Types.ObjectId | string;
    userId: Types.ObjectId | string;
    type: 'mention';
    sender: string;
    senderId: Types.ObjectId | string;
    serverId?: Types.ObjectId | string;
    channelId?: Types.ObjectId | string;
    messageId: Types.ObjectId | string;
    message: Record<string, unknown>;
    timestamp: Date;
    createdAt?: Date;
}

// Ping Repository Interface
//
// Encapsulates all ping-related database operations
export interface IPingRepository {
    // Find ping by ID
    findById(id: string): Promise<IPing | null>;

    // Find all pings for a user (with optional age filter)
    findByUserId(userId: string, maxAge?: number): Promise<IPing[]>;

    // Create a new ping
    create(data: {
        userId: string;
        type: 'mention';
        sender: string;
        senderId: string;
        serverId?: string;
        channelId?: string;
        messageId: string;
        message: Record<string, unknown>;
        timestamp?: Date;
    }): Promise<IPing>;

    // Check if a ping already exists (for deduplication)
    exists(
        userId: string,
        senderId: string,
        messageId: string,
    ): Promise<boolean>;

    // Delete a specific ping by ID
    delete(id: string): Promise<boolean>;

    // Delete all pings for a specific channel
    deleteByChannelId(userId: string, channelId: string): Promise<number>;

    // Delete all pings for a user
    deleteByUserId(userId: string): Promise<number>;

    // Delete old pings (older than specified age)
    deleteOldPings(maxAge: number): Promise<number>;
}
