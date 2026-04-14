import {
    Controller,
    Get,
    Post,
    Delete,
    Body,
    Param,
    UseGuards,
    Req,
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
    ApiBearerAuth,
} from '@nestjs/swagger';
import { TYPES } from '@/di/types';
import { WsServer } from '@/ws/server';
import { injectable } from 'inversify';
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

import { ErrorMessages } from '@/constants/errorMessages';
import type { Request as ExpressRequest } from 'express';
import { JWTPayload } from '@/utils/jwt';
import crypto from 'crypto';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { CreateInviteRequestDTO } from './dto/server-invite.request.dto';
import { InviteDetailsResponseDTO } from './dto/server-invite.response.dto';

// Controller for managing server invites
// Enforces 'manageInvites' permission checks and owner-only custom code restrictions
@injectable()
@Controller('api/v1')
@ApiTags('Server Invites')
export class ServerInviteController {
    constructor(
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
    ) {}

    // Retrieves all active invites for a server
    // Enforces 'manageInvites' permission
    @Get('servers/:serverId/invites')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get all server invites' })
    @ApiResponse({ status: 200, description: 'Server invites retrieved' })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.INVITE.NO_PERMISSION_MANAGE,
    })
    public async getServerInvites(
        @Param('serverId') serverId: string,
        @Req() req: ExpressRequest,
    ): Promise<IInvite[]> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        if (
            !(await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageInvites',
            ))
        ) {
            throw new ForbiddenException(
                ErrorMessages.INVITE.NO_PERMISSION_MANAGE,
            );
        }

        return await this.inviteRepo.findByServerId(serverOid);
    }

    // Creates a new invite for a server
    // Enforces 'manageInvites' permission; custom codes require server ownership
    @Post('servers/:serverId/invites')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @HttpCode(200)
    @ApiOperation({ summary: 'Create a server invite' })
    @ApiResponse({ status: 201, description: 'Invite created' })
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
        @Req() req: ExpressRequest,
        @Body() body: CreateInviteRequestDTO,
    ): Promise<IInvite> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);

        if (
            !(await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageInvites',
            ))
        ) {
            throw new ForbiddenException(
                ErrorMessages.INVITE.NO_PERMISSION_MANAGE,
            );
        }

        const { maxUses, expiresIn, customPath } = body;

        let code = customPath;
        if (code) {
            // Restrict custom invite codes to the server owner to prevent squatting/abuse
            const server = await this.serverRepo.findById(serverOid);
            if (!server?.ownerId.equals(userOid)) {
                throw new ForbiddenException(
                    ErrorMessages.INVITE.ONLY_OWNER_CUSTOM,
                );
            }

            const existing = await this.inviteRepo.findByCode(code);
            if (existing) {
                throw new BadRequestException(
                    ErrorMessages.INVITE.ALREADY_EXISTS,
                );
            }
        } else {
            // Generate a random 8-character hex code if no custom code is provided
            code = crypto.randomBytes(4).toString('hex');
        }

        const expiresAt = expiresIn
            ? new Date(Date.now() + expiresIn * 1000)
            : undefined;

        const invite = await this.inviteRepo.create({
            serverId: serverOid,
            code,
            maxUses: maxUses || 0,
            expiresAt,
            createdByUserId: userOid,
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverOid,
            actorId: userOid,
            actionType: 'invite_create',
            targetId: invite._id as Types.ObjectId,
            targetType: 'server',
            metadata: {
                code: invite.code,
                maxUses: invite.maxUses,
                expiresAt: invite.expiresAt,
            },
        });

        return invite;
    }

    // Deletes an invite
    // Enforces 'manageInvites' permission
    @Delete('servers/:serverId/invites/:inviteId')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Delete a server invite' })
    @ApiResponse({ status: 200, description: 'Invite deleted' })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.INVITE.NO_PERMISSION_MANAGE,
    })
    @ApiResponse({ status: 404, description: ErrorMessages.INVITE.NOT_FOUND })
    public async deleteInvite(
        @Param('serverId') serverId: string,
        @Param('inviteId') inviteId: string,
        @Req() req: ExpressRequest,
    ): Promise<{ message: string }> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        const inviteOid = new Types.ObjectId(inviteId);
        if (
            !(await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageInvites',
            ))
        ) {
            throw new ForbiddenException(
                ErrorMessages.INVITE.NO_PERMISSION_MANAGE,
            );
        }

        const invite = await this.inviteRepo.findById(inviteOid);
        if (!invite || !invite.serverId.equals(serverOid)) {
            throw new NotFoundException(ErrorMessages.INVITE.NOT_FOUND);
        }

        await this.inviteRepo.delete(inviteOid);

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

        return { message: 'Invite deleted' };
    }

    // Retrieves public details for an invite code
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
        if (!invite) {
            throw new NotFoundException(ErrorMessages.INVITE.NOT_FOUND);
        }

        // Check if the invite has reached its expiration date
        if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
            throw new HttpException(
                ErrorMessages.INVITE.EXPIRED,
                HttpStatus.GONE,
            );
        }

        // Check if the invite has exceeded its maximum allowed uses
        if (
            invite.maxUses &&
            invite.maxUses > 0 &&
            invite.uses >= invite.maxUses
        ) {
            throw new HttpException(
                ErrorMessages.INVITE.MAX_USES_REACHED,
                HttpStatus.GONE,
            );
        }

        const server = await this.serverRepo.findById(invite.serverId);
        if (!server) {
            this.logger.warn('getInviteDetails: Server not found for invite:', {
                serverId: invite.serverId.toString(),
            });
            throw new NotFoundException(ErrorMessages.SERVER.NOT_FOUND);
        }

        const memberCount = await this.serverMemberRepo.countByServerId(
            invite.serverId,
        );

        return {
            code: invite.customPath || invite.code,
            expiresAt: invite.expiresAt,
            maxUses: invite.maxUses,
            uses: invite.uses,
            server: {
                id: server._id.toString(),
                name: server.name,
                icon: server.icon,
                banner: server.banner,
                verified: server.verified,
                tags: server.tags || [],
            },
            memberCount,
        };
    }

    // Joins a server using an invite code
    // Enforces ban checks and automatically assigns default roles
    @Post('invites/:code/join')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @HttpCode(200)
    @ApiOperation({ summary: 'Join a server using an invite' })
    @ApiResponse({ status: 200, description: 'Server joined' })
    @ApiResponse({
        status: 400,
        description: ErrorMessages.SERVER.ALREADY_MEMBER,
    })
    @ApiResponse({ status: 403, description: ErrorMessages.SERVER.BANNED })
    @ApiResponse({ status: 404, description: ErrorMessages.INVITE.NOT_FOUND })
    @ApiResponse({ status: 410, description: ErrorMessages.INVITE.EXPIRED })
    public async joinServer(
        @Param('code') code: string,
        @Req() req: ExpressRequest,
    ): Promise<{ serverId: string }> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const invite = await this.inviteRepo.findByCodeOrCustomPath(code);
        if (!invite) {
            throw new NotFoundException(ErrorMessages.INVITE.NOT_FOUND);
        }

        if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
            throw new HttpException(
                ErrorMessages.INVITE.EXPIRED,
                HttpStatus.GONE,
            );
        }

        if (
            invite.maxUses &&
            invite.maxUses > 0 &&
            invite.uses >= invite.maxUses
        ) {
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
        if (existingMember) {
            throw new BadRequestException(ErrorMessages.SERVER.ALREADY_MEMBER);
        }

        // Prevent banned users from re-joining via invite
        const existingBan = await this.serverBanRepo.findByServerAndUser(
            serverOid,
            userOid,
        );
        if (existingBan) {
            throw new ForbiddenException(ErrorMessages.SERVER.BANNED);
        }

        const server = await this.serverRepo.findById(serverOid);
        const roles: Types.ObjectId[] = [];

        // Automatically assign the mandatory '@everyone' role
        const everyoneRole = await this.roleRepo.findByServerIdAndName(
            serverOid,
            '@everyone',
        );
        if (everyoneRole) {
            roles.push(everyoneRole._id);
        }

        // Assign the server's configured default role, if any
        if (server?.defaultRoleId) {
            roles.push(server.defaultRoleId);
        }

        await this.serverMemberRepo.create({
            serverId: serverOid,
            userId: userOid,
            roles,
        });

        // Increment invite usage count after successful join
        await this.inviteRepo.incrementUses(invite._id);
        this.permissionService.invalidateCache(serverOid);

        this.wsServer.broadcastToServer(serverId, {
            type: 'member_added',
            payload: { serverId, userId },
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

        return { serverId };
    }
}
