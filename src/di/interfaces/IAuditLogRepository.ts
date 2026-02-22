import type { Types } from 'mongoose';

// Audit Log interface
//
// Represents a permanent, immutable record of actions
export interface IAuditLog {
    _id: Types.ObjectId;
    actorId: Types.ObjectId;
    actionType: string;
    targetUserId?: Types.ObjectId;
    additionalData?: Record<string, unknown>;
    timestamp: Date;
}

// Audit Log Repository Interface
//
// Encapsulates all audit log related database operations
export interface IAuditLogRepository {
    // Create a new audit log entry
    create(data: {
        actorId: Types.ObjectId;
        actionType: string;
        targetUserId?: Types.ObjectId;
        additionalData?: Record<string, unknown>;
    }): Promise<IAuditLog>;

    // Find audit logs with pagination and filtering
    find(options: {
        limit?: number;
        offset?: number;
        actorId?: Types.ObjectId;
        actionType?: string;
        targetUserId?: Types.ObjectId;
        startDate?: Date;
        endDate?: Date;
    }): Promise<IAuditLog[]>;

    // Find audit log by ID
    findById(id: Types.ObjectId): Promise<IAuditLog | null>;

    // Count audit logs matching criteria
    count(options: {
        actorId?: Types.ObjectId;
        actionType?: string;
        targetUserId?: Types.ObjectId;
        startDate?: Date;
        endDate?: Date;
    }): Promise<number>;
}
