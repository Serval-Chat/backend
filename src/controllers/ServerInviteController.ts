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
import { ErrorResponse } from '@/controllers/models/ErrorResponse';
import { ErrorMessages } from '@/constants/errorMessages';
import type { Request as ExpressRequest } from 'express';
import { JWTPayload } from '@/utils/jwt';
import { ApiError } from '@/utils/ApiError';
import crypto from 'crypto';
import mongoose from 'mongoose';

interface CreateInviteRequest {
    maxUses?: number;
    expiresIn?: number; // In seconds
    customPath?: string;
}

interface InviteDetailsResponse {
    code: string;
    expiresAt?: Date;
    maxUses?: number;
    uses: number;
    server: {
        id: string | mongoose.Types.ObjectId;
        name: string;
        icon?: string;
        banner?: {
            type: 'image' | 'gradient' | 'color' | 'gif';
            value: string;
        };
    };
    memberCount: number;
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
        @Request() req: ExpressRequest,
    ): Promise<IInvite[]> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageInvites',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.INVITE.NO_PERMISSION_MANAGE);
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
        @Request() req: ExpressRequest,
        @Body() body: CreateInviteRequest,
    ): Promise<IInvite> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;

        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageInvites',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.INVITE.NO_PERMISSION_MANAGE);
        }

        const { maxUses, expiresIn, customPath } = body;

        let code = customPath;
        if (code) {
            // Restrict custom invite codes to the server owner to prevent squatting/abuse
            const server = await this.serverRepo.findById(serverId);
            if (server?.ownerId.toString() !== userId) {
                throw new ApiError(403, ErrorMessages.INVITE.ONLY_OWNER_CUSTOM);
            }

            const existing = await this.inviteRepo.findByCode(code);
            if (existing) {
                throw new ApiError(400, ErrorMessages.INVITE.ALREADY_EXISTS);
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
        @Request() req: ExpressRequest,
    ): Promise<{ message: string }> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageInvites',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.INVITE.NO_PERMISSION_MANAGE);
        }

        const invite = await this.inviteRepo.findById(inviteId);
        if (!invite || invite.serverId.toString() !== serverId) {
            throw new ApiError(404, ErrorMessages.INVITE.NOT_FOUND);
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
    public async getInviteDetails(@Path() code: string): Promise<InviteDetailsResponse> {
        const invite = await this.inviteRepo.findByCodeOrCustomPath(code);
        if (!invite) {
            throw new ApiError(404, ErrorMessages.INVITE.NOT_FOUND);
        }

        // Check if the invite has reached its expiration date
        if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
            throw new ApiError(410, ErrorMessages.INVITE.EXPIRED);
        }

        // Check if the invite has exceeded its maximum allowed uses
        if (
            invite.maxUses &&
            invite.maxUses > 0 &&
            invite.uses >= invite.maxUses
        ) {
            throw new ApiError(410, ErrorMessages.INVITE.MAX_USES_REACHED);
        }

        const server = await this.serverRepo.findById(
            invite.serverId.toString(),
        );
        if (!server) {
            this.logger.warn('getInviteDetails: Server not found for invite:', {
                serverId: invite.serverId.toString(),
            });
            throw new ApiError(404, ErrorMessages.SERVER.NOT_FOUND);
        }

        const memberCount = await this.serverMemberRepo.countByServerId(
            invite.serverId.toString(),
        );

        return {
            code: invite.customPath || invite.code,
            expiresAt: invite.expiresAt,
            maxUses: invite.maxUses,
            uses: invite.uses,
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
        @Request() req: ExpressRequest,
    ): Promise<{ serverId: string }> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const invite = await this.inviteRepo.findByCodeOrCustomPath(code);
        if (!invite) {
            throw new ApiError(404, ErrorMessages.INVITE.NOT_FOUND);
        }

        if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
            throw new ApiError(410, ErrorMessages.INVITE.EXPIRED);
        }

        if (
            invite.maxUses &&
            invite.maxUses > 0 &&
            invite.uses >= invite.maxUses
        ) {
            throw new ApiError(410, ErrorMessages.INVITE.MAX_USES_REACHED);
        }

        const serverId = invite.serverId.toString();
        const existingMember = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (existingMember) {
            throw new ApiError(400, ErrorMessages.SERVER.ALREADY_MEMBER);
        }

        // Prevent banned users from re-joining via invite
        const existingBan = await this.serverBanRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (existingBan) {
            throw new ApiError(403, ErrorMessages.SERVER.BANNED);
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
