import { Injectable } from '@nestjs/common';
import { type FilterQuery, Types } from 'mongoose';
import type {
    IAuditLog,
    IAuditLogRepository,
} from '@/di/interfaces/IAuditLogRepository';
import { AuditLog } from '@/models/AuditLog';
import { injectable } from 'inversify';

// Mongoose implementation of Audit Log repository
@injectable()
@Injectable()
export class MongooseAuditLogRepository implements IAuditLogRepository {
    private auditLogModel = AuditLog;
    constructor() {}

    async create(data: {
        actorId: string;
        actionType: string;
        targetUserId?: string;
        additionalData?: Record<string, unknown>;
    }): Promise<IAuditLog> {
        const auditLog = new this.auditLogModel({
            actorId: new Types.ObjectId(data.actorId),
            actionType: data.actionType,
            targetUserId: data.targetUserId
                ? new Types.ObjectId(data.targetUserId)
                : undefined,
            additionalData: data.additionalData,
            timestamp: new Date(),
        });

        const savedAuditLog = await auditLog.save();
        return savedAuditLog.toObject() as IAuditLog;
    }

    async find(options: {
        limit?: number;
        offset?: number;
        actorId?: string;
        actionType?: string;
        targetUserId?: string;
        startDate?: Date;
        endDate?: Date;
    }): Promise<IAuditLog[]> {
        const query: FilterQuery<IAuditLog> = {};

        if (options.actorId) {
            query.actorId = new Types.ObjectId(options.actorId);
        }

        if (options.actionType) {
            query.actionType = options.actionType;
        }

        if (options.targetUserId) {
            query.targetUserId = new Types.ObjectId(options.targetUserId);
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

        const results = await this.auditLogModel
            .find(query)
            .sort({ timestamp: -1 })
            .limit(options.limit || 100)
            .skip(options.offset || 0)
            .populate('actorId', 'username')
            .populate('targetUserId', 'username')
            .lean()
            .exec();

        return results as unknown as IAuditLog[];
    }

    async findById(id: string): Promise<IAuditLog | null> {
        const result = await this.auditLogModel
            .findById(id)
            .populate('actorId', 'username')
            .populate('targetUserId', 'username')
            .lean()
            .exec();

        return result as IAuditLog | null;
    }

    async count(options: {
        actorId?: string;
        actionType?: string;
        targetUserId?: string;
        startDate?: Date;
        endDate?: Date;
    }): Promise<number> {
        const query: FilterQuery<IAuditLog> = {};

        if (options.actorId) {
            query.actorId = new Types.ObjectId(options.actorId);
        }

        if (options.actionType) {
            query.actionType = options.actionType;
        }

        if (options.targetUserId) {
            query.targetUserId = new Types.ObjectId(options.targetUserId);
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
