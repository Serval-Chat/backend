import {
    Controller,
    Get,
    Post,
    Delete,
    Route,
    Body,
    Path,
    Security,
    Response,
    Tags,
    Request,
} from 'tsoa';
import { injectable, inject } from 'inversify';
import { TYPES } from '@/di/types';
import type {
    IInviteRepository,
    IInvite,
} from '@/di/interfaces/IInviteRepository';
import type { IServerRepository } from '@/di/interfaces/IServerRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IChannelRepository } from '@/di/interfaces/IChannelRepository';
import type { IRoleRepository } from '@/di/interfaces/IRoleRepository';
import { PermissionService } from '@/services/PermissionService';
import type { IServerBanRepository } from '@/di/interfaces/IServerBanRepository';
import type { ILogger } from '@/di/interfaces/ILogger';
import { getIO } from '@/socket';
import express from 'express';
import crypto from 'crypto';
import { ErrorResponse } from '@/controllers/models/ErrorResponse';
import { ErrorMessages } from '@/constants/errorMessages';

interface CreateInviteRequest {
    maxUses?: number;
    expiresIn?: number; // In seconds
    customPath?: string;
}

// Controller for managing server invites
// Enforces 'manageInvites' permission checks and owner-only custom code restrictions
@injectable()
@Route('api/v1')
@Tags('Server Invites')
export class ServerInviteController extends Controller {
    constructor(
        @inject(TYPES.InviteRepository) private inviteRepo: IInviteRepository,
        @inject(TYPES.ServerRepository) private serverRepo: IServerRepository,
        @inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @inject(TYPES.ChannelRepository)
        private channelRepo: IChannelRepository,
        @inject(TYPES.RoleRepository) private roleRepo: IRoleRepository,
        @inject(TYPES.ServerBanRepository)
        private serverBanRepo: IServerBanRepository,
        @inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @inject(TYPES.Logger) private logger: ILogger,
    ) {
        super();
    }

    // Retrieves all active invites for a server
    // Enforces 'manageInvites' permission
    @Get('servers/{serverId}/invites')
    @Security('jwt')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.INVITE.NO_PERMISSION_MANAGE,
    })
    public async getServerInvites(
        @Path() serverId: string,
        @Request() req: express.Request,
    ): Promise<IInvite[]> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageInvites',
            ))
        ) {
            this.setStatus(403);
            const error = new Error(
                ErrorMessages.INVITE.NO_PERMISSION_MANAGE,
            ) as any;
            error.status = 403;
            throw error;
        }

        return await this.inviteRepo.findByServerId(serverId);
    }

    // Creates a new invite for a server
    // Enforces 'manageInvites' permission; custom codes require server ownership
    @Post('servers/{serverId}/invites')
    @Security('jwt')
    @Response<ErrorResponse>('400', 'Bad Request', {
        error: ErrorMessages.INVITE.ALREADY_EXISTS,
    })
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.INVITE.ONLY_OWNER_CUSTOM,
    })
    public async createInvite(
        @Path() serverId: string,
        @Request() req: express.Request,
        @Body() body: CreateInviteRequest,
    ): Promise<IInvite> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;

        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageInvites',
            ))
        ) {
            this.setStatus(403);
            const error = new Error(
                ErrorMessages.INVITE.NO_PERMISSION_MANAGE,
            ) as any;
            error.status = 403;
            throw error;
        }

        const { maxUses, expiresIn, customPath } = body;

        let code = customPath;
        if (code) {
            // Restrict custom invite codes to the server owner to prevent squatting/abuse
            const server = await this.serverRepo.findById(serverId);
            if (server?.ownerId.toString() !== userId) {
                this.setStatus(403);
                const error = new Error(
                    ErrorMessages.INVITE.ONLY_OWNER_CUSTOM,
                ) as any;
                error.status = 403;
                throw error;
            }

            const existing = await this.inviteRepo.findByCode(code);
            if (existing) {
                this.setStatus(400);
                const error = new Error(
                    ErrorMessages.INVITE.ALREADY_EXISTS,
                ) as any;
                error.status = 400;
                throw error;
            }
        } else {
            // Generate a random 8-character hex code if no custom code is provided
            code = crypto.randomBytes(4).toString('hex');
        }

        const expiresAt = expiresIn
            ? new Date(Date.now() + expiresIn * 1000)
            : undefined;

        return await this.inviteRepo.create({
            serverId,
            code,
            maxUses: maxUses || 0,
            expiresAt,
            createdByUserId: userId,
        });
    }

    // Deletes an invite
    // Enforces 'manageInvites' permission
    @Delete('servers/{serverId}/invites/{inviteId}')
    @Security('jwt')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.INVITE.NO_PERMISSION_MANAGE,
    })
    @Response<ErrorResponse>('404', 'Invite Not Found', {
        error: ErrorMessages.INVITE.NOT_FOUND,
    })
    public async deleteInvite(
        @Path() serverId: string,
        @Path() inviteId: string,
        @Request() req: express.Request,
    ): Promise<{ message: string }> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageInvites',
            ))
        ) {
            this.setStatus(403);
            const error = new Error(
                ErrorMessages.INVITE.NO_PERMISSION_MANAGE,
            ) as any;
            error.status = 403;
            throw error;
        }

        const invite = await this.inviteRepo.findById(inviteId);
        if (!invite || invite.serverId.toString() !== serverId) {
            this.setStatus(404);
            const error = new Error(ErrorMessages.INVITE.NOT_FOUND) as any;
            error.status = 404;
            throw error;
        }

        await this.inviteRepo.delete(inviteId);

        return { message: 'Invite deleted' };
    }

    // Retrieves public details for an invite code
    @Get('invites/{code}')
    @Response<ErrorResponse>('404', 'Invite Not Found', {
        error: ErrorMessages.INVITE.NOT_FOUND,
    })
    @Response<ErrorResponse>('410', 'Invite Expired or Max Uses Reached', {
        error: ErrorMessages.INVITE.EXPIRED,
    })
    public async getInviteDetails(@Path() code: string): Promise<any> {
        const invite = await this.inviteRepo.findByCodeOrCustomPath(code);
        if (!invite) {
            this.setStatus(404);
            const error = new Error(ErrorMessages.INVITE.NOT_FOUND) as any;
            error.status = 404;
            throw error;
        }

        // Check if the invite has reached its expiration date
        if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
            this.setStatus(410);
            const error = new Error(ErrorMessages.INVITE.EXPIRED) as any;
            error.status = 410;
            throw error;
        }

        // Check if the invite has exceeded its maximum allowed uses
        if (
            invite.maxUses &&
            invite.maxUses > 0 &&
            invite.uses >= invite.maxUses
        ) {
            this.setStatus(410);
            const error = new Error(
                ErrorMessages.INVITE.MAX_USES_REACHED,
            ) as any;
            error.status = 410;
            throw error;
        }

        const server = await this.serverRepo.findById(
            invite.serverId.toString(),
        );
        if (!server) {
            console.log(
                'getInviteDetails: Server not found for invite:',
                invite.serverId,
            );
            this.setStatus(404);
            const error = new Error(ErrorMessages.SERVER.NOT_FOUND) as any;
            error.status = 404;
            throw error;
        }

        const memberCount = await this.serverMemberRepo.countByServerId(
            invite.serverId.toString(),
        );

        return {
            code: invite.code,
            server: {
                id: server._id,
                name: server.name,
                icon: server.icon,
                banner: server.banner,
            },
            memberCount,
        };
    }

    // Joins a server using an invite code
    // Enforces ban checks and automatically assigns default roles
    @Post('invites/{code}/join')
    @Security('jwt')
    @Response<ErrorResponse>('400', 'Bad Request', {
        error: ErrorMessages.SERVER.ALREADY_MEMBER,
    })
    @Response<ErrorResponse>('403', 'Banned', {
        error: ErrorMessages.SERVER.BANNED,
    })
    @Response<ErrorResponse>('404', 'Invite Not Found', {
        error: ErrorMessages.INVITE.NOT_FOUND,
    })
    @Response<ErrorResponse>('410', 'Invite Expired or Max Uses Reached', {
        error: ErrorMessages.INVITE.EXPIRED,
    })
    public async joinServer(
        @Path() code: string,
        @Request() req: express.Request,
    ): Promise<{ serverId: string }> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        const invite = await this.inviteRepo.findByCodeOrCustomPath(code);
        if (!invite) {
            this.setStatus(404);
            const error = new Error(ErrorMessages.INVITE.NOT_FOUND) as any;
            error.status = 404;
            throw error;
        }

        if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
            this.setStatus(410);
            const error = new Error(ErrorMessages.INVITE.EXPIRED) as any;
            error.status = 410;
            throw error;
        }

        if (
            invite.maxUses &&
            invite.maxUses > 0 &&
            invite.uses >= invite.maxUses
        ) {
            this.setStatus(410);
            const error = new Error(
                ErrorMessages.INVITE.MAX_USES_REACHED,
            ) as any;
            error.status = 410;
            throw error;
        }

        const serverId = invite.serverId.toString();
        const existingMember = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (existingMember) {
            this.setStatus(400);
            const error = new Error(ErrorMessages.SERVER.ALREADY_MEMBER) as any;
            error.status = 400;
            throw error;
        }

        // Prevent banned users from re-joining via invite
        const existingBan = await this.serverBanRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (existingBan) {
            this.setStatus(403);
            const error = new Error(ErrorMessages.SERVER.BANNED) as any;
            error.status = 403;
            throw error;
        }

        const server = await this.serverRepo.findById(serverId);
        const roles: string[] = [];

        // Automatically assign the mandatory '@everyone' role
        const everyoneRole = await this.roleRepo.findByServerIdAndName(
            serverId,
            '@everyone',
        );
        if (everyoneRole) {
            roles.push(everyoneRole._id.toString());
        }

        // Assign the server's configured default role, if any
        if (server?.defaultRoleId) {
            roles.push(server.defaultRoleId.toString());
        }

        await this.serverMemberRepo.create({
            serverId,
            userId,
            roles,
        });

        // Increment invite usage count after successful join
        await this.inviteRepo.incrementUses(invite._id.toString());

        const io = getIO();
        io.to(`server:${serverId}`).emit('member_added', { serverId, userId });

        return { serverId };
    }
}
