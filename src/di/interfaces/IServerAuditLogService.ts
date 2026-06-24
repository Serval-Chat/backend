import type {
    IAuditLog,
    IAuditLogChange,
} from '@/di/interfaces/IAuditLogRepository';

export interface IServerAuditLogService {
    /**
     * Create an audit log entry and broadcast it to all authorized server members.
     */
    createAndBroadcast(data: {
        serverId: string;
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
}
