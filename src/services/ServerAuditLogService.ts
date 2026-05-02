import { Inject, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { injectable } from 'inversify';
import { TYPES } from '@/di/types';
import {
    IAuditLogRepository,
    IAuditLog,
    IAuditLogChange,
} from '@/di/interfaces/IAuditLogRepository';
import { IWsServer } from '@/ws/interfaces/IWsServer';
import { PermissionService } from '@/permissions/PermissionService';
import { ILogger } from '@/di/interfaces/ILogger';
import { mapAuditLogEntry } from '@/utils/auditLog';
import { IServerAuditLogService } from '@/di/interfaces/IServerAuditLogService';

@injectable()
@Injectable()
export class ServerAuditLogService implements IServerAuditLogService {
    public constructor(
        @Inject(TYPES.AuditLogRepository)
        private auditLogRepo: IAuditLogRepository,
        @Inject(TYPES.WsServer)
        private wsServer: IWsServer,
        @Inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @Inject(TYPES.Logger)
        private logger: ILogger,
    ) {}

    public async createAndBroadcast(data: {
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
    }): Promise<IAuditLog> {
        const serverIdStr = data.serverId.toString();

        this.logger.debug(
            `[ServerAuditLogService] Creating audit log: ${data.actionType} on server ${serverIdStr}`,
        );

        const auditLog = await this.auditLogRepo.create(data);

        const populatedAuditLog = await this.auditLogRepo.findById(
            auditLog._id as Types.ObjectId,
        );
        if (populatedAuditLog) {
            this.logger.debug(
                `[ServerAuditLogService] Broadcasting audit_log_entry_created for ${data.actionType}`,
            );
            void this.wsServer.broadcastToServerWithPermission(
                serverIdStr,
                {
                    type: 'audit_log_entry_created',
                    payload: {
                        serverId: serverIdStr,
                        entry: mapAuditLogEntry(populatedAuditLog),
                    },
                },
                {
                    type: 'server',
                    permission: 'manageServer',
                },
            );
        } else {
            this.logger.warn(
                `[ServerAuditLogService] Failed to find populated audit log for broadcast: ${auditLog._id}`,
            );
        }

        return auditLog;
    }
}
