import {
    Controller,
    Get,
    Patch,
    Delete,
    Param,
    Body,
    UseGuards,
    Inject,
    NotFoundException,
} from '@nestjs/common';
import {
    ApiTags,
    ApiBearerAuth,
    ApiOkResponse,
    ApiResponse,
} from '@nestjs/swagger';
import { TYPES } from '@/di/types';
import type { ISessionRepository } from '@/di/interfaces/ISessionRepository';
import { GeoIpService } from '@/services/GeoIpService';
import { VpnDetectionService } from '@/services/VpnDetectionService';
import { AuthGuard } from '@/modules/auth/auth.module';
import { NoBot } from '@/modules/auth/bot.decorator';
import { CurrentUser } from '@/modules/auth/current-user.decorator';
import {
    revokeSessionById,
    revokeAllSessionsForUser,
} from '@/utils/sessionAuth';
import { PROJECT_LEVEL } from '@/config/env';
import {
    SessionListResponseDTO,
    RevokeSessionsResponseDTO,
    UpdateSessionIpResponseDTO,
} from './dto/session.response.dto';
import { UpdateSessionIpRequestDTO } from './dto/session.request.dto';

@ApiTags('Sessions')
@Controller('api/v1/auth/sessions')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class SessionController {
    public constructor(
        @Inject(TYPES.SessionRepository)
        private sessionRepo: ISessionRepository,
        @Inject(TYPES.GeoIpService)
        private geoIpService: GeoIpService,
        @Inject(TYPES.VpnDetectionService)
        private vpnDetectionService: VpnDetectionService,
    ) {}

    @Get()
    @ApiOkResponse({ type: SessionListResponseDTO })
    public async listSessions(
        @CurrentUser('id') userId: string,
        @CurrentUser('sessionId') currentSessionId: string | undefined,
    ): Promise<SessionListResponseDTO> {
        const sessions = await this.sessionRepo.findByUser(userId);

        return {
            sessions: sessions.map((session) => {
                const location = this.geoIpService.lookup(session.ip);
                const ipRisk = this.vpnDetectionService.classify(session.ip);

                return {
                    id: session.snowflakeId,
                    userAgent: session.userAgent,
                    ip: session.ip,
                    location:
                        location === null
                            ? undefined
                            : [location.city, location.country]
                                  .filter(
                                      (part): part is string =>
                                          part !== undefined,
                                  )
                                  .join(', '),
                    ipRisk: ipRisk ?? undefined,
                    createdAt: session.createdAt,
                    lastSeenAt: session.lastSeenAt,
                    expiresAt: session.expiresAt,
                    isCurrent: session.snowflakeId === currentSessionId,
                };
            }),
        };
    }

    @Delete('others')
    @ApiOkResponse({ type: RevokeSessionsResponseDTO })
    public async revokeOtherSessions(
        @CurrentUser('id') userId: string,
        @CurrentUser('sessionId') currentSessionId: string | undefined,
    ): Promise<RevokeSessionsResponseDTO> {
        const revoked = await revokeAllSessionsForUser(
            userId,
            currentSessionId,
        );

        return {
            message: 'Other sessions revoked',
            revokedCount: revoked.length,
        };
    }

    @Delete(':sessionId')
    @ApiOkResponse({ type: RevokeSessionsResponseDTO })
    @ApiResponse({ status: 404, description: 'Session not found' })
    public async revokeSession(
        @CurrentUser('id') userId: string,
        @Param('sessionId') sessionId: string,
    ): Promise<RevokeSessionsResponseDTO> {
        const session = await revokeSessionById(sessionId, userId);
        if (session === null) {
            throw new NotFoundException('Session not found');
        }

        return { message: 'Session revoked', revokedCount: 1 };
    }

    @Patch(':sessionId/ip')
    @NoBot()
    @ApiOkResponse({ type: UpdateSessionIpResponseDTO })
    @ApiResponse({
        status: 404,
        description:
            'Session not found, or the server is not running in development',
    })
    public async updateSessionIp(
        @CurrentUser('id') userId: string,
        @Param('sessionId') sessionId: string,
        @Body() body: UpdateSessionIpRequestDTO,
    ): Promise<UpdateSessionIpResponseDTO> {
        if (PROJECT_LEVEL !== 'development') {
            throw new NotFoundException();
        }

        const session = await this.sessionRepo.updateIp(
            sessionId,
            userId,
            body.ip,
        );
        if (session === null) {
            throw new NotFoundException('Session not found');
        }

        return { message: 'Session IP updated', ip: session.ip };
    }
}
