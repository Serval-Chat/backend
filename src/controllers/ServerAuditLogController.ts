import {
    Controller,
    Get,
    Query,
    Param,
    UseGuards,
    Inject,
    ForbiddenException,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiOkResponse,
    ApiBearerAuth,
} from '@nestjs/swagger';
import { TYPES } from '@/di/types';
import type { IAuditLogRepository } from '@/di/interfaces/IAuditLogRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import { PermissionService } from '@/permissions/PermissionService';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { CurrentUser } from '@/modules/auth/current-user.decorator';
import { ServerAuditLogRequestDTO } from './dto/server-audit-log.request.dto';
import {
    ServerAuditLogResponseDTO,
    ServerAuditLogEntryDTO,
} from './dto/server-audit-log.response.dto';
import { mapAuditLogEntry } from '@/utils/auditLog';

@Controller('api/v1/servers/:serverId')
@ApiTags('Server Audit Log')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ServerAuditLogController {
    public constructor(
        @Inject(TYPES.AuditLogRepository)
        private auditLogRepo: IAuditLogRepository,
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @Inject(TYPES.PermissionService)
        private permissionService: PermissionService,
    ) {}

    @Get('audit-log')
    @ApiOperation({ summary: 'Get server audit log' })
    @ApiOkResponse({
        type: ServerAuditLogResponseDTO,
        description: 'Audit log entries',
    })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async getAuditLog(
        @Param('serverId') serverId: string,
        @Query() query: ServerAuditLogRequestDTO,
        @CurrentUser('id') userId: string,
    ): Promise<ServerAuditLogResponseDTO> {
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (member === null) {
            throw new ForbiddenException('You are not a member of this server');
        }

        await this.permissionService.requirePermission(
            serverId,
            userId,
            'manageServer',
            new ForbiddenException(
                'You do not have permission to view the audit log',
            ),
        );

        const limit = Math.min(Number(query.limit) || 50, 100);

        const entries = await this.auditLogRepo.find({
            serverId: serverId,
            limit: limit + 1, // fetch one extra to determine if there's a next page
            cursor: query.cursor,
            actionType: query.action,
            actorId:
                query.moderatorId !== undefined && query.moderatorId !== ''
                    ? query.moderatorId
                    : undefined,
            targetId:
                query.targetId !== undefined && query.targetId !== ''
                    ? query.targetId
                    : undefined,
            startDate:
                query.after !== undefined && query.after !== ''
                    ? new Date(query.after)
                    : undefined,
            endDate:
                query.before !== undefined && query.before !== ''
                    ? new Date(query.before)
                    : undefined,
            reason: query.reason,
        });

        const hasMore = entries.length > limit;
        const pageEntries = hasMore ? entries.slice(0, limit) : entries;
        const lastEntry = pageEntries[pageEntries.length - 1];
        const nextCursor = hasMore && lastEntry ? lastEntry.snowflakeId : null;

        return {
            entries: pageEntries.map((entry) =>
                mapAuditLogEntry(entry),
            ) as ServerAuditLogEntryDTO[],
            nextCursor,
        };
    }
}
