import type { Types } from 'mongoose';

// Ban interface
export interface IBan {
    _id: Types.ObjectId; // Mongoose ObjectId type
    userId: Types.ObjectId;
    reason: string;
    active: boolean;
    expirationTimestamp?: Date;
    createdAt?: Date;
    issuedBy?: Types.ObjectId;
    timestamp?: Date;
    // Historical record of previous bans or updates to this ban
    history?: Array<{
        reason: string;
        issuedBy: Types.ObjectId;
        timestamp: Date;
        expirationTimestamp?: Date;
        endedAt?: Date;
    }>;
}

// Ban Repository Interface
//
// Encapsulates all ban-related database operations
export interface IBanRepository {
    // Find active ban for a user
    findActiveByUserId(userId: Types.ObjectId): Promise<IBan | null>;

    // Create a new ban
    create(
        userId: Types.ObjectId,
        reason: string,
        expirationTimestamp?: Date,
    ): Promise<IBan>;

    // Expire (deactivate) a ban
    expire(banId: Types.ObjectId): Promise<boolean>;

    // Check and expire bans that have passed their expiration time
    checkExpired(userId: Types.ObjectId): Promise<void>;

    // Find all active bans
    findAllActive(): Promise<IBan[]>;

    // Find ban by user ID with history
    findByUserIdWithHistory(userId: Types.ObjectId): Promise<IBan | null>;

    // Create or update ban with history
    createOrUpdateWithHistory(data: {
        userId: Types.ObjectId;
        reason: string;
        issuedBy: Types.ObjectId;
        expirationTimestamp?: Date;
    }): Promise<IBan>;

    // Deactivate all bans for a user
    deactivateAllForUser(
        userId: Types.ObjectId,
    ): Promise<{ modifiedCount: number }>;

    // Delete all bans for a user (for hard delete)
    deleteAllForUser(userId: Types.ObjectId): Promise<{ deletedCount: number }>;

    // Find all bans with pagination
    findAll(options: { limit?: number; offset?: number }): Promise<IBan[]>;

    // Count active bans
    countActive(): Promise<number>;

    // Count bans created after a certain date
    countCreatedAfter(date: Date): Promise<number>;
}
