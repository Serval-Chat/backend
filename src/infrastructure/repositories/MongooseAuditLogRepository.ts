import { AuditLog } from '@/models/AuditLog';
import type {
    IAuditLog,
    IAuditLogRepository,
} from '@/di/interfaces/IAuditLogRepository';
import { Types } from 'mongoose';

/**
 * Mongoose implementation of Audit Log Repository
 */
export class MongooseAuditLogRepository implements IAuditLogRepository {
    async create(data: {
        adminId: string;
        actionType: string;
        targetUserId?: string;
        additionalData?: any;
    }): Promise<IAuditLog> {
        const auditLog = new AuditLog({
            adminId: new Types.ObjectId(data.adminId),
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
        adminId?: string;
        actionType?: string;
        targetUserId?: string;
        startDate?: Date;
        endDate?: Date;
    }): Promise<IAuditLog[]> {
        const query: any = {};

        if (options.adminId) {
            query.adminId = new Types.ObjectId(options.adminId);
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

        const results = await AuditLog.find(query)
            .sort({ timestamp: -1 })
            .limit(options.limit || 100)
            .skip(options.offset || 0)
            /**
             * Populate admin and target user info for UI display.
             */
            .populate('adminId', 'username')
            .populate('targetUserId', 'username')
            .lean()
            .exec();

        return results as unknown as IAuditLog[];
    }

    async findById(id: string): Promise<IAuditLog | null> {
        const result = await AuditLog.findById(id)
            .populate('adminId', 'username')
            .populate('targetUserId', 'username')
            .lean()
            .exec();

        return result as IAuditLog | null;
    }

    async count(options: {
        adminId?: string;
        actionType?: string;
        targetUserId?: string;
        startDate?: Date;
        endDate?: Date;
    }): Promise<number> {
        const query: any = {};

        if (options.adminId) {
            query.adminId = new Types.ObjectId(options.adminId);
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

        return await AuditLog.countDocuments(query);
    }
}
