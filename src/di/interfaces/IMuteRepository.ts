import type { Types } from 'mongoose';

export interface IMute {
    _id: Types.ObjectId;
    snowflakeId: string;
    userId: string;
    reason: string;
    active: boolean;
    expirationTimestamp?: Date;
    createdAt?: Date;
    issuedBy?: string;
    timestamp?: Date;
    history?: Array<{
        reason: string;
        issuedBy: string;
        timestamp: Date;
        expirationTimestamp?: Date;
        endedAt?: Date;
    }>;
}

export interface IMuteRepository {
    findActiveByUserId(userId: string): Promise<IMute | null>;
    create(
        userId: string,
        reason: string,
        expirationTimestamp?: Date,
    ): Promise<IMute>;
    expire(muteId: string): Promise<boolean>;
    checkExpired(userId: string): Promise<void>;
    findAllActive(): Promise<IMute[]>;
    findByUserIdWithHistory(userId: string): Promise<IMute | null>;
    createOrUpdateWithHistory(data: {
        userId: string;
        reason: string;
        issuedBy: string;
        expirationTimestamp?: Date;
    }): Promise<IMute>;
    deactivateAllForUser(userId: string): Promise<{ modifiedCount: number }>;
    deleteAllForUser(userId: string): Promise<{ deletedCount: number }>;
    findAll(options: { limit?: number; offset?: number }): Promise<IMute[]>;
    countActive(): Promise<number>;
    countCreatedAfter(date: Date): Promise<number>;
}
