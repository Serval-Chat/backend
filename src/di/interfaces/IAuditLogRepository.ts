import type { Types } from 'mongoose';

/**
 * Audit Log interface.
 *
 * Represents a permanent, immutable record of actions.
 */
export interface IAuditLog {
    _id: Types.ObjectId | string;
    adminId: Types.ObjectId | string;
    actionType: string;
    targetUserId?: Types.ObjectId | string;
    additionalData?: any;
    timestamp: Date;
}

/**
 * Audit Log Repository Interface
 *
 * Encapsulates all audit log related database operations
 */
export interface IAuditLogRepository {
    /**
     * Create a new audit log entry
     */
    create(data: {
        adminId: string;
        actionType: string;
        targetUserId?: string;
        additionalData?: any;
    }): Promise<IAuditLog>;

    /**
     * Find audit logs with pagination and filtering
     */
    find(options: {
        limit?: number;
        offset?: number;
        adminId?: string;
        actionType?: string;
        targetUserId?: string;
        startDate?: Date;
        endDate?: Date;
    }): Promise<IAuditLog[]>;

    /**
     * Find audit log by ID
     */
    findById(id: string): Promise<IAuditLog | null>;

    /**
     * Count audit logs matching criteria
     */
    count(options: {
        adminId?: string;
        actionType?: string;
        targetUserId?: string;
        startDate?: Date;
        endDate?: Date;
    }): Promise<number>;
}
