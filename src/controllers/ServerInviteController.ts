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
import { Types } from 'mongoose';
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
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { CreateInviteRequestDTO } from './dto/server-invite.request.dto';
import {
    InviteDetailsResponseDTO,
    ServerInviteResponseDTO,
    JoinServerResponseDTO,
    InviteDeletedResponseDTO,
} from '@/controllers/dto/server-invite.response.dto';
import { ServerDiscoveryService } from '@/services/ServerDiscoveryService';
import { getDocumentId } from '@/utils/mongooseId';
import {
    isInviteExpired,
    isInviteMaxedOut,
    isInviteUsable,
} from '@/utils/invite';

@Controller('api/v1')
@ApiTags('Server Invites')
export class ServerInviteController {
    public constructor(
        @Inject(TYPES.InviteRepository)
        private inviteRepo: IInviteRepository,
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
    ) {}

    @Get('servers/:serverId/invites')
    @UseGuards(JwtAuthGuard)
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
    ): Promise<(IInvite & { createdByUsername?: string })[]> {
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        await this.permissionService.requirePermission(
            serverOid,
            userOid,
            'manageInvites',
            new ForbiddenException(ErrorMessages.INVITE.NO_PERMISSION_MANAGE),
        );

        const invites = await this.inviteRepo.findByServerId(serverOid);
        const creatorIds = [
            ...new Set(
                invites.map((invite): string => String(invite.createdByUserId)),
            ),
        ].map((id): Types.ObjectId => new Types.ObjectId(id));
        const creators = await this.userRepo.findByIds(creatorIds);
        const usernameById = new Map(
            creators.map((user): [string, string | undefined] => [
                String(user._id),
                user.username,
            ]),
        );

        return invites.map((invite) => ({
            ...invite,
            createdByUsername: usernameById.get(String(invite.createdByUserId)),
        }));
    }

    @Post('servers/:serverId/invites')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @HttpCode(200)
    @ApiOperation({ summary: 'Create a new invite for a server' })
    @ApiOkResponse({
        type: ServerInviteResponseDTO,
        description: 'Invite created',
    })
    @ApiResponse({
        status: 400,
        description: ErrorMessages.INVITE.ALREADY_EXISTS,
    })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.INVITE.ONLY_OWNER_CUSTOM,
    })
    public async createInvite(
        @Param('serverId') serverId: string,
        @CurrentUser('id') userId: string,
        @CurrentUser('username') username: string,
        @Body() body: CreateInviteRequestDTO,
    ): Promise<IInvite & { createdByUsername?: string }> {
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        const { maxUses, expiresIn, customPath } = body;

        let code = customPath;
        if (code !== undefined && code !== '') {
            await this.ensureVanityInviteAllowed(
                serverOid,
                userId,
                userOid,
                code,
            );
        } else {
            await this.ensureRegularInviteAllowed(serverOid, userOid);

            if (maxUses === undefined && expiresIn === undefined) {
                const reused = await this.reusePreferredInvite(serverOid);
                if (reused !== null) return reused;
            }

            code = crypto.randomBytes(4).toString('hex');
        }

        const expiresAt =
            expiresIn !== undefined && expiresIn !== 0
                ? new Date(Date.now() + expiresIn * 1000)
                : undefined;

        const invite = await this.inviteRepo.create({
            serverId: serverOid,
            code,
            customPath:
                customPath !== undefined && customPath !== ''
                    ? customPath
                    : undefined,
            maxUses: maxUses !== undefined ? maxUses : 0,
            expiresAt,
            createdByUserId: userOid,
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverOid,
            actorId: userOid,
            actionType: 'invite_create',
            targetId: getDocumentId(invite) as Types.ObjectId,
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

        await this.discoveryService.refreshServer(serverOid);

        return { ...invite, createdByUsername: username };
    }

    private async ensureVanityInviteAllowed(
        serverOid: Types.ObjectId,
        userId: string,
        userOid: Types.ObjectId,
        code: string,
    ): Promise<void> {
        await this.permissionService.requirePermission(
            serverOid,
            userOid,
            'manageInvites',
            new ForbiddenException(ErrorMessages.INVITE.NO_PERMISSION_MANAGE),
        );

        const server = await this.serverRepo.findById(serverOid);
        if (server === null || String(server.ownerId) !== userId) {
            throw new ForbiddenException(
                ErrorMessages.INVITE.ONLY_OWNER_CUSTOM,
            );
        }

        const existing = await this.inviteRepo.findByCode(code);
        if (existing !== null) {
            throw new BadRequestException(ErrorMessages.INVITE.ALREADY_EXISTS);
        }
    }

    private async ensureRegularInviteAllowed(
        serverOid: Types.ObjectId,
        userOid: Types.ObjectId,
    ): Promise<void> {
        await this.permissionService.requireAnyPermission(
            serverOid,
            userOid,
            ['inviteUsers', 'manageInvites'],
            new ForbiddenException(ErrorMessages.INVITE.NO_PERMISSION_INVITE),
        );
    }

    private async reusePreferredInvite(
        serverOid: Types.ObjectId,
    ): Promise<(IInvite & { createdByUsername?: string }) | null> {
        const preferred =
            await this.inviteRepo.findPreferredByServerId(serverOid);
        if (preferred === null || !isInviteUsable(preferred)) return null;

        const creator = await this.userRepo.findById(preferred.createdByUserId);
        return { ...preferred, createdByUsername: creator?.username };
    }

    @Delete('servers/:serverId/invites/:inviteId')
    @UseGuards(JwtAuthGuard)
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
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        const inviteOid = new Types.ObjectId(inviteId);
        await this.permissionService.requirePermission(
            serverOid,
            userOid,
            'manageInvites',
            new ForbiddenException(ErrorMessages.INVITE.NO_PERMISSION_MANAGE),
        );

        const invite = await this.inviteRepo.findById(inviteOid);
        if (invite === null || !invite.serverId.equals(serverOid)) {
            throw new NotFoundException(ErrorMessages.INVITE.NOT_FOUND);
        }

        await this.inviteRepo.delete(inviteOid);
        await this.discoveryService.refreshServer(serverOid);

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverOid,
            actorId: userOid,
            actionType: 'invite_delete',
            targetId: inviteOid,
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
        const invite = await this.inviteRepo.findByCodeOrCustomPath(code);
        if (invite === null) {
            throw new NotFoundException(ErrorMessages.INVITE.NOT_FOUND);
        }

        if (isInviteExpired(invite)) {
            throw new HttpException(
                ErrorMessages.INVITE.EXPIRED,
                HttpStatus.GONE,
            );
        }

        if (isInviteMaxedOut(invite)) {
            throw new HttpException(
                ErrorMessages.INVITE.MAX_USES_REACHED,
                HttpStatus.GONE,
            );
        }

        const server = await this.serverRepo.findById(invite.serverId);
        if (server === null) {
            this.logger.warn('getInviteDetails: Server not found for invite:', {
                serverId: invite.serverId.toString(),
            });
            throw new NotFoundException(ErrorMessages.SERVER.NOT_FOUND);
        }

        const memberCount = await this.serverMemberRepo.countByServerId(
            invite.serverId,
        );

        return {
            code:
                invite.customPath !== undefined && invite.customPath !== ''
                    ? invite.customPath
                    : invite.code,
            expiresAt: invite.expiresAt,
            maxUses: invite.maxUses,
            uses: invite.uses,
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
    @UseGuards(JwtAuthGuard)
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
        const invite = await this.inviteRepo.findByCodeOrCustomPath(code);
        if (invite === null) {
            throw new NotFoundException(ErrorMessages.INVITE.NOT_FOUND);
        }

        if (isInviteExpired(invite)) {
            throw new HttpException(
                ErrorMessages.INVITE.EXPIRED,
                HttpStatus.GONE,
            );
        }

        if (isInviteMaxedOut(invite)) {
            throw new HttpException(
                ErrorMessages.INVITE.MAX_USES_REACHED,
                HttpStatus.GONE,
            );
        }

        const serverId = invite.serverId.toString();
        const serverOid = invite.serverId;
        const userOid = new Types.ObjectId(userId);
        const existingMember = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            userOid,
        );
        if (existingMember !== null) {
            throw new BadRequestException(ErrorMessages.SERVER.ALREADY_MEMBER);
        }

        // Prevent banned users from re-joining via invite
        const existingBan = await this.serverBanRepo.findByServerAndUser(
            serverOid,
            userOid,
        );
        if (existingBan !== null) {
            throw new ForbiddenException(ErrorMessages.SERVER.BANNED);
        }

        const server = await this.serverRepo.findById(serverOid);
        const roles: Types.ObjectId[] = [];

        const everyoneRole = await this.roleRepo.findByServerIdAndName(
            serverOid,
            '@everyone',
        );
        if (everyoneRole !== null) {
            roles.push(getDocumentId(everyoneRole) as Types.ObjectId);
        }

        if (server !== null && server.defaultRoleId !== undefined) {
            roles.push(new Types.ObjectId(server.defaultRoleId));
        }

        await this.serverMemberRepo.create({
            serverId: serverOid,
            userId: userOid,
            roles,
            onboardingRequired: server?.onboarding?.enabled === true,
        });

        // Increment invite usage count after successful join
        await this.inviteRepo.incrementUses(
            getDocumentId(invite) as Types.ObjectId,
        );
        this.permissionService.invalidateCache(serverOid);

        const user = await this.userRepo.findById(userOid);
        const username =
            user !== null ? (user.username ?? 'Unknown') : 'Unknown';

        this.wsServer.broadcastToServer(serverId, {
            type: 'member_added',
            payload: { serverId, userId, username },
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverOid,
            actorId: userOid,
            actionType: 'member_join',
            targetId: userOid,
            targetType: 'user',
            targetUserId: userOid,
            metadata: {
                inviteCode: code,
                inviteUses: invite.uses + 1,
                inviteMaxUses: invite.maxUses,
                inviteExpiresAt: invite.expiresAt,
            },
        });

        await this.discoveryService.refreshServer(serverOid);

        return { serverId };
    }
}
