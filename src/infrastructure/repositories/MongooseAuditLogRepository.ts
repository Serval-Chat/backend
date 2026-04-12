import { Injectable } from '@nestjs/common';
import { type FilterQuery, Types } from 'mongoose';
import type {
    IAuditLog,
    IAuditLogChange,
    IAuditLogRepository,
} from '@/di/interfaces/IAuditLogRepository';
import { AuditLog } from '@/models/AuditLog';
import { injectable } from 'inversify';

@injectable()
@Injectable()
export class MongooseAuditLogRepository implements IAuditLogRepository {
    private auditLogModel = AuditLog;
    constructor() {}

    async create(data: {
        serverId?: Types.ObjectId;
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
        return savedAuditLog.toObject() as IAuditLog;
    }

    async find(options: {
        serverId?: Types.ObjectId | null;
        limit?: number;
        offset?: number;
        cursor?: string;
        actorId?: Types.ObjectId;
        actionType?: string;
        targetId?: Types.ObjectId;
        targetUserId?: Types.ObjectId;
        startDate?: Date;
        endDate?: Date;
        reason?: string;
    }): Promise<IAuditLog[]> {
        const query: FilterQuery<IAuditLog> = {};

        if (options.serverId !== undefined) {
            query.serverId = options.serverId;
        }

        if (options.actorId) {
            query.actorId = options.actorId;
        }

        if (options.actionType) {
            query.actionType = options.actionType;
        }

        if (options.targetId) {
            query.targetId = options.targetId;
        }

        if (options.targetUserId) {
            query.targetUserId = options.targetUserId;
        }

        if (options.reason) {
            query.reason = { $regex: options.reason, $options: 'i' };
        }

        if (options.startDate || options.endDate) {
            query.timestamp = {};
            if (options.startDate) {
                query.timestamp.$gte = options.startDate;
            }
            if (options.endDate) {
                query.timestamp.$lte = options.endDate;
            }
        }

        if (options.cursor) {
            try {
                query._id = { $lt: new Types.ObjectId(options.cursor) };
            } catch {}
        }

        const results = await this.auditLogModel
            .find(query)
            .sort({ _id: -1 })
            .limit(options.limit || 50)
            .populate('actorId', 'username profilePicture displayName')
            .populate('targetUserId', 'username displayName profilePicture')
            .lean()
            .exec();

        return results as unknown as IAuditLog[];
    }

    async findById(id: Types.ObjectId): Promise<IAuditLog | null> {
        const result = await this.auditLogModel
            .findById(id)
            .populate('actorId', 'username profilePicture displayName')
            .populate('targetUserId', 'username displayName profilePicture')
            .lean()
            .exec();

        return result as IAuditLog | null;
    }

    async count(options: {
        serverId?: Types.ObjectId | null;
        actorId?: Types.ObjectId;
        actionType?: string;
        targetUserId?: Types.ObjectId;
        startDate?: Date;
        endDate?: Date;
    }): Promise<number> {
        const query: FilterQuery<IAuditLog> = {};

        if (options.serverId !== undefined) {
            query.serverId = options.serverId;
        }

        if (options.actorId) {
            query.actorId = options.actorId;
        }

        if (options.actionType) {
            query.actionType = options.actionType;
        }

        if (options.targetUserId) {
            query.targetUserId = options.targetUserId;
        }

        if (options.startDate || options.endDate) {
            query.timestamp = {};
            if (options.startDate) {
                query.timestamp.$gte = options.startDate;
            }
            if (options.endDate) {
                query.timestamp.$lte = options.endDate;
            }
        }

        return await this.auditLogModel.countDocuments(query);
    }
}
