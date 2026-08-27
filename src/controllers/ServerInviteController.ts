import {
    Controller,
    Get,
    Post,
    Delete,
    Body,
    Param,
    UseGuards,
    Inject,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
    HttpException,
    HttpStatus,
    HttpCode,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiOkResponse,
    ApiBearerAuth,
} from '@nestjs/swagger';
import { TYPES } from '@/di/types';
import { WsServer } from '@/ws/server';
import type {
    IInviteRepository,
    IInvite,
} from '@/di/interfaces/IInviteRepository';
import type { IVanityLinkRepository } from '@/di/interfaces/IVanityLinkRepository';
import type { IServerRepository } from '@/di/interfaces/IServerRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IChannelRepository } from '@/di/interfaces/IChannelRepository';
import type { IRoleRepository } from '@/di/interfaces/IRoleRepository';
import { PermissionService } from '@/permissions/PermissionService';
import type { IServerBanRepository } from '@/di/interfaces/IServerBanRepository';
import type { ILogger } from '@/di/interfaces/ILogger';
import type { IServerAuditLogService } from '@/di/interfaces/IServerAuditLogService';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';

import { ErrorMessages } from '@/constants/errorMessages';
import { CurrentUser } from '@/modules/auth/current-user.decorator';
import crypto from 'crypto';
import { AuthGuard } from '@/modules/auth/auth.module';
import { Public } from '@/modules/auth/public.decorator';
import { CreateInviteRequestDTO } from './dto/server-invite.request.dto';
import {
    InviteDetailsResponseDTO,
    ServerInviteResponseDTO,
    JoinServerResponseDTO,
    InviteDeletedResponseDTO,
} from '@/controllers/dto/server-invite.response.dto';
import { ServerDiscoveryService } from '@/services/ServerDiscoveryService';
import {
    isInviteExpired,
    isInviteMaxedOut,
    resolveJoinTarget,
    getJoinTargetServerId,
    getJoinTargetCode,
} from '@/utils/invite';
import type { IWarningRepository } from '@/di/interfaces/IWarningRepository';
import { assertHttpNotWarned } from '@/utils/warning';

@Controller('api/v1')
@ApiTags('Server Invites')
export class ServerInviteController {
    public constructor(
        @Inject(TYPES.InviteRepository)
        private inviteRepo: IInviteRepository,
        @Inject(TYPES.VanityLinkRepository)
        private vanityLinkRepo: IVanityLinkRepository,
        @Inject(TYPES.ServerRepository)
        private serverRepo: IServerRepository,
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @Inject(TYPES.ChannelRepository)
        private channelRepo: IChannelRepository,
        @Inject(TYPES.RoleRepository)
        private roleRepo: IRoleRepository,
        @Inject(TYPES.ServerBanRepository)
        private serverBanRepo: IServerBanRepository,
        @Inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @Inject(TYPES.Logger)
        private logger: ILogger,
        @Inject(TYPES.WsServer)
        private wsServer: WsServer,
        @Inject(TYPES.ServerAuditLogService)
        private serverAuditLogService: IServerAuditLogService,
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
        @Inject(TYPES.ServerDiscoveryService)
        private discoveryService: ServerDiscoveryService,
        @Inject(TYPES.WarningRepository)
        private warningRepo: IWarningRepository,
    ) {}

    @Get('servers/:serverId/invites')
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get all invites for a server' })
    @ApiOkResponse({
        type: [ServerInviteResponseDTO],
        description: 'Server invites retrieved',
    })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.INVITE.NO_PERMISSION_MANAGE,
    })
    public async getServerInvites(
        @Param('serverId') serverId: string,
        @CurrentUser('id') userId: string,
    ): Promise<(IInvite & { id: string; createdByUsername?: string })[]> {
        await this.permissionService.requirePermission(
            serverId,
            userId,
            'manageInvites',
            new ForbiddenException(ErrorMessages.INVITE.NO_PERMISSION_MANAGE),
        );

        const invites = await this.inviteRepo.findByServerId(serverId);
        const creatorIds = [
            ...new Set(
                invites.map((invite): string => String(invite.createdByUserId)),
            ),
        ];
        const creators = await this.userRepo.findByIds(creatorIds);
        const usernameById = new Map(
            creators.map((user): [string, string | undefined] => [
                user.snowflakeId,
                user.username,
            ]),
        );

        return invites.map((invite) => ({
            ...invite,
            id: invite.snowflakeId,
            createdByUsername: usernameById.get(String(invite.createdByUserId)),
        }));
    }

    @Post('servers/:serverId/invites')
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    @HttpCode(200)
    @ApiOperation({ summary: 'Create a new invite for a server' })
    @ApiOkResponse({
        type: ServerInviteResponseDTO,
        description: 'Invite created',
    })
    public async createInvite(
        @Param('serverId') serverId: string,
        @CurrentUser('id') userId: string,
        @CurrentUser('username') username: string,
        @Body() body: CreateInviteRequestDTO,
    ): Promise<IInvite & { id: string; createdByUsername?: string }> {
        await assertHttpNotWarned(this.warningRepo, userId, 'create invites');

        const { maxUses, expiresIn } = body;

        await this.ensureRegularInviteAllowed(serverId, userId);

        const code = await this.generateUnusedInviteCode();

        const expiresAt =
            expiresIn !== undefined && expiresIn !== 0
                ? new Date(Date.now() + expiresIn * 1000)
                : undefined;

        const invite = await this.inviteRepo.create({
            serverId: serverId,
            code,
            maxUses: maxUses !== undefined ? maxUses : 0,
            expiresAt,
            createdByUserId: userId,
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverId,
            actorId: userId,
            actionType: 'invite_create',
            targetId: invite.snowflakeId,
            targetType: 'server',
            metadata: {
                code: invite.code,
                maxUses: invite.maxUses,
                expiresAt: invite.expiresAt,
            },
        });

        this.wsServer.broadcastToServer(serverId, {
            type: 'server_invite_created',
            payload: {
                serverId,
                code: invite.code,
                maxUses: invite.maxUses ?? null,
                expiresAt: invite.expiresAt ?? null,
                senderId: userId,
            },
        });

        await this.discoveryService.refreshServer(serverId);

        return {
            ...invite,
            id: invite.snowflakeId,
            createdByUsername: username,
        };
    }

    private async ensureRegularInviteAllowed(
        serverId: string,
        userId: string,
    ): Promise<void> {
        await this.permissionService.requireAnyPermission(
            serverId,
            userId,
            ['inviteUsers', 'manageInvites'],
            new ForbiddenException(ErrorMessages.INVITE.NO_PERMISSION_INVITE),
        );
    }

    private async generateUnusedInviteCode(): Promise<string> {
        for (let attempt = 0; attempt < 5; attempt++) {
            const code = crypto.randomBytes(4).toString('hex');
            const existingVanity = await this.vanityLinkRepo.findByCode(code);
            if (existingVanity === null) return code;
        }
        throw new Error(
            'Failed to generate a unique invite code after 5 attempts',
        );
    }

    @Delete('servers/:serverId/invites/:inviteId')
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Delete a server invite' })
    @ApiOkResponse({
        type: InviteDeletedResponseDTO,
        description: 'Invite deleted',
    })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.INVITE.NO_PERMISSION_MANAGE,
    })
    @ApiResponse({ status: 404, description: ErrorMessages.INVITE.NOT_FOUND })
    public async deleteInvite(
        @Param('serverId') serverId: string,
        @Param('inviteId') inviteId: string,
        @CurrentUser('id') userId: string,
    ): Promise<{ message: string }> {
        await this.permissionService.requirePermission(
            serverId,
            userId,
            'manageInvites',
            new ForbiddenException(ErrorMessages.INVITE.NO_PERMISSION_MANAGE),
        );

        const invite = await this.inviteRepo.findById(inviteId);
        if (invite === null || invite.serverId !== serverId) {
            throw new NotFoundException(ErrorMessages.INVITE.NOT_FOUND);
        }

        await this.inviteRepo.delete(inviteId);
        await this.discoveryService.refreshServer(serverId);

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverId,
            actorId: userId,
            actionType: 'invite_delete',
            targetId: inviteId,
            targetType: 'server',
            metadata: {
                code: invite.code,
                uses: invite.uses,
                maxUses: invite.maxUses,
                expiresAt: invite.expiresAt,
            },
        });

        this.wsServer.broadcastToServer(serverId, {
            type: 'server_invite_deleted',
            payload: {
                serverId,
                code: invite.code,
                senderId: userId,
            },
        });

        return { message: 'Invite deleted' };
    }

    @Get('invites/:code')
    @Public()
    @ApiOperation({ summary: 'Get invite details' })
    @ApiResponse({
        status: 200,
        description: 'Invite details retrieved',
        type: InviteDetailsResponseDTO,
    })
    @ApiResponse({ status: 404, description: ErrorMessages.INVITE.NOT_FOUND })
    @ApiResponse({ status: 410, description: ErrorMessages.INVITE.EXPIRED })
    public async getInviteDetails(
        @Param('code') code: string,
    ): Promise<InviteDetailsResponseDTO> {
        const target = await resolveJoinTarget(
            this.inviteRepo,
            this.vanityLinkRepo,
            code,
        );
        if (target === null) {
            throw new NotFoundException(ErrorMessages.INVITE.NOT_FOUND);
        }

        if (target.source === 'invite') {
            if (isInviteExpired(target.invite)) {
                throw new HttpException(
                    ErrorMessages.INVITE.EXPIRED,
                    HttpStatus.GONE,
                );
            }

            if (isInviteMaxedOut(target.invite)) {
                throw new HttpException(
                    ErrorMessages.INVITE.MAX_USES_REACHED,
                    HttpStatus.GONE,
                );
            }
        }

        const serverId = getJoinTargetServerId(target);
        const server = await this.serverRepo.findById(serverId);
        if (server === null) {
            this.logger.warn('getInviteDetails: Server not found for invite:', {
                serverId: serverId.toString(),
            });
            throw new NotFoundException(ErrorMessages.SERVER.NOT_FOUND);
        }

        const memberCount =
            await this.serverMemberRepo.countByServerId(serverId);

        return {
            code: getJoinTargetCode(target),
            expiresAt:
                target.source === 'invite'
                    ? target.invite.expiresAt
                    : undefined,
            maxUses:
                target.source === 'invite' ? target.invite.maxUses : undefined,
            uses: target.source === 'invite' ? target.invite.uses : 0,
            server: {
                id: server.id,
                name: server.name,
                icon: server.icon,
                banner: server.banner,
                verified: server.verified,
                tags: server.tags || [],
            },
            memberCount,
        };
    }

    @Post('invites/:code/join')
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    @HttpCode(200)
    @ApiOperation({ summary: 'Join a server using an invite code' })
    @ApiOkResponse({
        type: JoinServerResponseDTO,
        description: 'Server joined',
    })
    @ApiResponse({
        status: 400,
        description: ErrorMessages.SERVER.ALREADY_MEMBER,
    })
    @ApiResponse({ status: 403, description: ErrorMessages.SERVER.BANNED })
    @ApiResponse({ status: 404, description: ErrorMessages.INVITE.NOT_FOUND })
    @ApiResponse({ status: 410, description: ErrorMessages.INVITE.EXPIRED })
    public async joinServer(
        @Param('code') code: string,
        @CurrentUser('id') userId: string,
    ): Promise<{ serverId: string }> {
        const target = await resolveJoinTarget(
            this.inviteRepo,
            this.vanityLinkRepo,
            code,
        );
        if (target === null) {
            throw new NotFoundException(ErrorMessages.INVITE.NOT_FOUND);
        }

        if (target.source === 'invite') {
            if (isInviteExpired(target.invite)) {
                throw new HttpException(
                    ErrorMessages.INVITE.EXPIRED,
                    HttpStatus.GONE,
                );
            }

            if (isInviteMaxedOut(target.invite)) {
                throw new HttpException(
                    ErrorMessages.INVITE.MAX_USES_REACHED,
                    HttpStatus.GONE,
                );
            }
        }

        const serverId = getJoinTargetServerId(target);
        const existingMember = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (existingMember !== null) {
            throw new BadRequestException(ErrorMessages.SERVER.ALREADY_MEMBER);
        }

        // Prevent banned users from re-joining via invite
        const existingBan = await this.serverBanRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (existingBan !== null) {
            throw new ForbiddenException(ErrorMessages.SERVER.BANNED);
        }

        const server = await this.serverRepo.findById(serverId);
        const roles: string[] = [];

        const everyoneRole = await this.roleRepo.findByServerIdAndName(
            serverId,
            '@everyone',
        );
        if (everyoneRole !== null) {
            roles.push(everyoneRole.snowflakeId);
        }

        if (server !== null && server.defaultRoleId !== undefined) {
            roles.push(server.defaultRoleId);
        }

        let claimedUses: number | undefined;
        if (target.source === 'invite') {
            const claimedInvite = await this.inviteRepo.claimUse(
                target.invite.snowflakeId,
            );
            if (claimedInvite === null) {
                throw new HttpException(
                    ErrorMessages.INVITE.MAX_USES_REACHED,
                    HttpStatus.GONE,
                );
            }
            claimedUses = claimedInvite.uses;
        }

        try {
            await this.serverMemberRepo.create({
                serverId: serverId,
                userId: userId,
                roles,
                onboardingRequired: server?.onboarding?.enabled === true,
            });
        } catch (err) {
            if (target.source === 'invite') {
                await this.inviteRepo
                    .releaseUse(target.invite.snowflakeId)
                    .catch(() => undefined);
            }
            throw err;
        }

        this.permissionService.invalidateCache(serverId);

        this.wsServer.subscribeUserToServer(userId, serverId);

        const user = await this.userRepo.findById(userId);
        const username =
            user !== null ? (user.username ?? 'Unknown') : 'Unknown';

        this.wsServer.broadcastToServer(serverId, {
            type: 'member_added',
            payload: { serverId, userId, username },
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverId,
            actorId: userId,
            actionType: 'member_join',
            targetId: userId,
            targetType: 'user',
            targetUserId: userId,
            metadata: {
                inviteCode: code,
                viaVanityLink: target.source === 'vanity',
                inviteUses: claimedUses,
                inviteMaxUses:
                    target.source === 'invite'
                        ? target.invite.maxUses
                        : undefined,
                inviteExpiresAt:
                    target.source === 'invite'
                        ? target.invite.expiresAt
                        : undefined,
            },
        });

        await this.discoveryService.refreshServer(serverId);

        return { serverId };
    }
}
