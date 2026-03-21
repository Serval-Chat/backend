import type { Types } from 'mongoose';
import type {
    IAuditLog,
    IAuditLogChange,
} from '@/di/interfaces/IAuditLogRepository';

export interface IServerAuditLogService {
    /**
     * Create an audit log entry and broadcast it to all authorized server members.
     */
    createAndBroadcast(data: {
        serverId: Types.ObjectId;
        actorId: Types.ObjectId;
        actionType: string;
        targetId?: Types.ObjectId;
        targetType?:
            | 'user'
            | 'channel'
            | 'category'
            | 'role'
            | 'message'
            | 'server';
        targetUserId?: Types.ObjectId;
        changes?: IAuditLogChange[];
        reason?: string;
        metadata?: Record<string, unknown>;
        additionalData?: Record<string, unknown>;
    }): Promise<IAuditLog>;
}
