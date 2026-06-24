import type { Types } from 'mongoose';

export interface IAuditLogChange {
    field: string;
    before: unknown;
    after: unknown;
}

// Audit Log interface
//
// Represents a permanent, immutable record of actions
interface IAuditLogUserRef {
    _id: Types.ObjectId;
    username?: string;
    displayName?: string | null;
    profilePicture?: string;
}

export interface IAuditLog {
    _id: Types.ObjectId;
    snowflakeId: string;
    serverId?: string;
    actorId: string;
    // populated via .populate('actorIdUser'), present when actorId is a user.
    actorIdUser?: IAuditLogUserRef;
    actionType: string;
    targetId?: string;
    targetType?:
        | 'user'
        | 'channel'
        | 'category'
        | 'role'
        | 'message'
        | 'server';
    targetUserId?: string;
    // populated via .populate('targetUserIdUser'), present when targetUserId is a user.
    targetUserIdUser?: IAuditLogUserRef;
    changes?: IAuditLogChange[];
    reason?: string;
    metadata?: Record<string, unknown>;
    additionalData?: Record<string, unknown>;
    timestamp: Date;
}

// Audit Log Repository Interface
//
// Encapsulates all audit log related database operations
export interface IAuditLogRepository {
    // Create a new audit log entry
    create(data: {
        serverId?: string;
        actorId: string;
        actionType: string;
        targetId?: string;
        targetType?:
            | 'user'
            | 'channel'
            | 'category'
            | 'role'
            | 'message'
            | 'server';
        targetUserId?: string;
        changes?: IAuditLogChange[];
        reason?: string;
        metadata?: Record<string, unknown>;
        additionalData?: Record<string, unknown>;
    }): Promise<IAuditLog>;

    // Find audit logs with pagination and filtering
    find(options: {
        serverId?: string | null;
        limit?: number;
        offset?: number;
        cursor?: string; // snowflakeId string for cursor-based pagination
        actorId?: string;
        actionType?: string;
        targetId?: string;
        targetUserId?: string;
        startDate?: Date;
        endDate?: Date;
        reason?: string; // substring search
    }): Promise<IAuditLog[]>;

    // Find audit log by ID
    findById(id: string): Promise<IAuditLog | null>;

    // Count audit logs matching criteria
    count(options: {
        serverId?: string | null;
        actorId?: string;
        actionType?: string;
        targetUserId?: string;
        startDate?: Date;
        endDate?: Date;
    }): Promise<number>;
}
