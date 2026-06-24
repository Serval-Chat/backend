import { type QueryFilter } from 'mongoose';
import type {
    IAuditLog,
    IAuditLogChange,
    IAuditLogRepository,
} from '@/di/interfaces/IAuditLogRepository';
import { AuditLog } from '@/models/AuditLog';
import { injectable } from 'inversify';

@injectable()
export class MongooseAuditLogRepository implements IAuditLogRepository {
    private auditLogModel = AuditLog;
    public constructor() {}

    public async create(data: {
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
    }): Promise<IAuditLog> {
        const auditLog = new this.auditLogModel({
            serverId: data.serverId,
            actorId: data.actorId,
            actionType: data.actionType,
            targetId: data.targetId,
            targetType: data.targetType,
            targetUserId: data.targetUserId,
            changes: data.changes,
            reason: data.reason,
            metadata: data.metadata,
            additionalData: data.additionalData,
            timestamp: new Date(),
        });

        const savedAuditLog = await auditLog.save();
        return savedAuditLog.toObject();
    }

    public async find(options: {
        serverId?: string | null;
        limit?: number;
        offset?: number;
        cursor?: string;
        actorId?: string;
        actionType?: string;
        targetId?: string;
        targetUserId?: string;
        startDate?: Date;
        endDate?: Date;
        reason?: string;
    }): Promise<IAuditLog[]> {
        const query: QueryFilter<IAuditLog> = {};

        if (options.serverId !== undefined) {
            query.serverId = options.serverId;
        }

        if (options.actorId !== undefined) {
            query.actorId = options.actorId;
        }

        if (options.actionType !== undefined && options.actionType !== '') {
            query.actionType = options.actionType;
        }

        if (options.targetId !== undefined) {
            query.targetId = options.targetId;
        }

        if (options.targetUserId !== undefined) {
            query.targetUserId = options.targetUserId;
        }

        if (options.reason !== undefined && options.reason !== '') {
            query.reason = { $regex: options.reason, $options: 'i' };
        }

        if (options.startDate !== undefined || options.endDate !== undefined) {
            query.timestamp = {};
            if (options.startDate !== undefined) {
                query.timestamp.$gte = options.startDate;
            }
            if (options.endDate !== undefined) {
                query.timestamp.$lte = options.endDate;
            }
        }

        if (options.cursor !== undefined && options.cursor !== '') {
        }

        const results = await this.auditLogModel
            .find(query)
            .sort({ _id: -1 })
            .limit(options.limit ?? 50)
            .populate('actorIdUser', 'username profilePicture displayName')
            .populate('targetUserIdUser', 'username displayName profilePicture')
            .lean()
            .exec();

        return results;
    }

    public async findById(id: string): Promise<IAuditLog | null> {
        const result = await this.auditLogModel
            .findOne({ snowflakeId: id })
            .populate('actorIdUser', 'username profilePicture displayName')
            .populate('targetUserIdUser', 'username displayName profilePicture')
            .lean()
            .exec();

        return result;
    }

    public async count(options: {
        serverId?: string | null;
        actorId?: string;
        actionType?: string;
        targetUserId?: string;
        startDate?: Date;
        endDate?: Date;
    }): Promise<number> {
        const query: QueryFilter<IAuditLog> = {};

        if (options.serverId !== undefined) {
            query.serverId = options.serverId;
        }

        if (options.actorId !== undefined) {
            query.actorId = options.actorId;
        }

        if (options.actionType !== undefined && options.actionType !== '') {
            query.actionType = options.actionType;
        }

        if (options.targetUserId !== undefined) {
            query.targetUserId = options.targetUserId;
        }

        if (options.startDate !== undefined || options.endDate !== undefined) {
            query.timestamp = {};
            if (options.startDate !== undefined) {
                query.timestamp.$gte = options.startDate;
            }
            if (options.endDate !== undefined) {
                query.timestamp.$lte = options.endDate;
            }
        }

        return await this.auditLogModel.countDocuments(query);
    }
}
