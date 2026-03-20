import {
    Controller,
    Get,
    Query,
    Param,
    Req,
    UseGuards,
    Inject,
    ForbiddenException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
} from '@nestjs/swagger';
import { injectable } from 'inversify';
import { TYPES } from '@/di/types';
import type { IAuditLogRepository } from '@/di/interfaces/IAuditLogRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import { PermissionService } from '@/permissions/PermissionService';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import type { Request as ExpressRequest } from 'express';
import type { JWTPayload } from '@/utils/jwt';
import { ServerAuditLogRequestDTO } from './dto/server-audit-log.request.dto';
import { mapAuditLogEntry } from '@/utils/auditLog';

@injectable()
@Controller('api/v1/servers/:serverId')
@ApiTags('Server Audit Log')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ServerAuditLogController {
    constructor(
        @Inject(TYPES.AuditLogRepository)
        private auditLogRepo: IAuditLogRepository,
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @Inject(TYPES.PermissionService)
        private permissionService: PermissionService,
    ) {}

    @Get('audit-log')
    @ApiOperation({ summary: 'Get server audit log' })
    @ApiResponse({ status: 200, description: 'Audit log entries' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async getAuditLog(
        @Param('serverId') serverId: string,
        @Query() query: ServerAuditLogRequestDTO,
        @Req() req: ExpressRequest,
    ): Promise<{
        entries: ReturnType<typeof mapAuditLogEntry>[];
        nextCursor: string | null;
    }> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);

        // Verify membership
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            userOid,
        );
        if (!member) {
            throw new ForbiddenException('You are not a member of this server');
        }

        // Require manageServer permission to view audit log
        const hasPermission = await this.permissionService.hasPermission(
            serverOid,
            userOid,
            'manageServer',
        );
        if (!hasPermission) {
            throw new ForbiddenException(
                'You do not have permission to view the audit log',
            );
        }

        const limit = Math.min(Number(query.limit) || 50, 100);

        const entries = await this.auditLogRepo.find({
            serverId: serverOid,
            limit: limit + 1, // fetch one extra to determine if there's a next page
            cursor: query.cursor,
            actionType: query.action,
            actorId: query.moderatorId
                ? new Types.ObjectId(query.moderatorId)
                : undefined,
            targetId: query.targetId
                ? new Types.ObjectId(query.targetId)
                : undefined,
            startDate: query.after ? new Date(query.after) : undefined,
            endDate: query.before ? new Date(query.before) : undefined,
            reason: query.reason,
        });

        const hasMore = entries.length > limit;
        const pageEntries = hasMore ? entries.slice(0, limit) : entries;
        const lastEntry = pageEntries[pageEntries.length - 1];
        const nextCursor =
            hasMore && lastEntry?._id
                ? lastEntry._id.toString()
                : null;

        return {
            entries: pageEntries.map((entry) => mapAuditLogEntry(entry as Parameters<typeof mapAuditLogEntry>[0])),
            nextCursor,
        };
    }
}

