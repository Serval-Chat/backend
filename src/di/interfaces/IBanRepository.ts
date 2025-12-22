import type { Types } from 'mongoose';

/**
 * Ban interface.
 */
export interface IBan {
    _id: any; // Mongoose ObjectId type
    userId: Types.ObjectId | string;
    reason: string;
    active: boolean;
    expirationTimestamp?: Date;
    createdAt?: Date;
    issuedBy?: Types.ObjectId | string;
    timestamp?: Date;
    /**
     * Historical record of previous bans or updates to this ban.
     */
    history?: Array<{
        reason: string;
        issuedBy: Types.ObjectId | string;
        timestamp: Date;
        expirationTimestamp?: Date;
        endedAt?: Date;
    }>;
}

/**
 * Ban Repository Interface
 *
 * Encapsulates all ban-related database operations
 */
export interface IBanRepository {
    /**
     * Find active ban for a user
     */
    findActiveByUserId(userId: string): Promise<IBan | null>;

    /**
     * Create a new ban
     */
    create(
        userId: string,
        reason: string,
        expirationTimestamp?: Date,
    ): Promise<IBan>;

    /**
     * Expire (deactivate) a ban
     */
    expire(banId: string): Promise<boolean>;

    /**
     * Check and expire bans that have passed their expiration time.
     */
    checkExpired(userId: string): Promise<void>;

    /**
     * Find all active bans
     */
    findAllActive(): Promise<IBan[]>;

    /**
     * Find ban by user ID with history
     */
    findByUserIdWithHistory(userId: string): Promise<IBan | null>;

    /**
     * Create or update ban with history
     */
    createOrUpdateWithHistory(data: {
        userId: string;
        reason: string;
        issuedBy: string;
        expirationTimestamp?: Date;
    }): Promise<IBan>;

    /**
     * Deactivate all bans for a user
     */
    deactivateAllForUser(userId: string): Promise<{ modifiedCount: number }>;

    /**
     * Delete all bans for a user (for hard delete)
     */
    deleteAllForUser(userId: string): Promise<{ deletedCount: number }>;

    /**
     * Find all bans with pagination
     */
    findAll(options: { limit?: number; offset?: number }): Promise<IBan[]>;

    /**
     * Count active bans
     */
    countActive(): Promise<number>;

    /**
     * Count bans created after a certain date
     */
    countCreatedAfter(date: Date): Promise<number>;
}
