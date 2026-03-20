import type { Types } from 'mongoose';

export interface IAuditLogChange {
    field: string;
    before: unknown;
    after: unknown;
}

// Audit Log interface
//
// Represents a permanent, immutable record of actions
export interface IAuditLog {
    _id: Types.ObjectId;
    serverId?: Types.ObjectId;
    actorId: Types.ObjectId;
    actionType: string;
    targetId?: Types.ObjectId;
    targetType?: 'user' | 'channel' | 'category' | 'role' | 'message' | 'server';
    targetUserId?: Types.ObjectId;
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
        serverId?: Types.ObjectId;
        actorId: Types.ObjectId;
        actionType: string;
        targetId?: Types.ObjectId;
        targetType?: 'user' | 'channel' | 'category' | 'role' | 'message' | 'server';
        targetUserId?: Types.ObjectId;
        changes?: IAuditLogChange[];
        reason?: string;
        metadata?: Record<string, unknown>;
        additionalData?: Record<string, unknown>;
    }): Promise<IAuditLog>;

    // Find audit logs with pagination and filtering
    find(options: {
        serverId?: Types.ObjectId;
        limit?: number;
        offset?: number;
        cursor?: string; // ObjectId string for cursor-based pagination
        actorId?: Types.ObjectId;
        actionType?: string;
        targetId?: Types.ObjectId;
        targetUserId?: Types.ObjectId;
        startDate?: Date;
        endDate?: Date;
        reason?: string; // substring search
    }): Promise<IAuditLog[]>;

    // Find audit log by ID
    findById(id: Types.ObjectId): Promise<IAuditLog | null>;

    // Count audit logs matching criteria
    count(options: {
        serverId?: Types.ObjectId;
        actorId?: Types.ObjectId;
        actionType?: string;
        targetUserId?: Types.ObjectId;
        startDate?: Date;
        endDate?: Date;
    }): Promise<number>;
}
