import type { Types } from 'mongoose';

export interface IMute {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    reason: string;
    active: boolean;
    expirationTimestamp?: Date;
    createdAt?: Date;
    issuedBy?: Types.ObjectId;
    timestamp?: Date;
    history?: Array<{
        reason: string;
        issuedBy: Types.ObjectId;
        timestamp: Date;
        expirationTimestamp?: Date;
        endedAt?: Date;
    }>;
}

export interface IMuteRepository {
    findActiveByUserId(userId: Types.ObjectId): Promise<IMute | null>;
    create(
        userId: Types.ObjectId,
        reason: string,
        expirationTimestamp?: Date,
    ): Promise<IMute>;
    expire(muteId: Types.ObjectId): Promise<boolean>;
    checkExpired(userId: Types.ObjectId): Promise<void>;
    findAllActive(): Promise<IMute[]>;
    findByUserIdWithHistory(userId: Types.ObjectId): Promise<IMute | null>;
    createOrUpdateWithHistory(data: {
        userId: Types.ObjectId;
        reason: string;
        issuedBy: Types.ObjectId;
        expirationTimestamp?: Date;
    }): Promise<IMute>;
    deactivateAllForUser(
        userId: Types.ObjectId,
    ): Promise<{ modifiedCount: number }>;
    deleteAllForUser(userId: Types.ObjectId): Promise<{ deletedCount: number }>;
    findAll(options: { limit?: number; offset?: number }): Promise<IMute[]>;
    countActive(): Promise<number>;
    countCreatedAfter(date: Date): Promise<number>;
}
