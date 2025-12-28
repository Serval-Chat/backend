import {
    Controller,
    Get,
    Post,
    Delete,
    Route,
    Body,
    Path,
    Query,
    Security,
    Response,
    Tags,
    Request,
} from 'tsoa';
import { injectable, inject } from 'inversify';
import { TYPES } from '@/di/types';
import type {
    IServerMemberRepository,
    IServerMember,
} from '@/di/interfaces/IServerMemberRepository';
import type { IServerRepository } from '@/di/interfaces/IServerRepository';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type { IRoleRepository } from '@/di/interfaces/IRoleRepository';
import type { IServerBanRepository } from '@/di/interfaces/IServerBanRepository';
import { PermissionService } from '@/services/PermissionService';
import type { ILogger } from '@/di/interfaces/ILogger';
import { getIO } from '@/socket';
import { mapUser } from '@/utils/user';
import express from 'express';
import { ErrorResponse } from '@/controllers/models/ErrorResponse';
import { ErrorMessages } from '@/constants/errorMessages';

interface KickMemberRequest {
    reason?: string;
}

interface BanMemberRequest {
    reason?: string;
    deleteMessageDays?: number;
}

interface TransferOwnershipRequest {
    newOwnerId: string;
}

/**
 * Controller for managing server members, including kicks, bans, and role assignments.
 * Enforces permission checks and prevents actions against server owners.
 */
@injectable()
@Route('api/v1/servers/{serverId}')
@Tags('Server Members')
@Security('jwt')
export class ServerMemberController extends Controller {
    constructor(
        @inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @inject(TYPES.ServerRepository) private serverRepo: IServerRepository,
        @inject(TYPES.UserRepository) private userRepo: IUserRepository,
        @inject(TYPES.RoleRepository) private roleRepo: IRoleRepository,
        @inject(TYPES.ServerBanRepository)
        private serverBanRepo: IServerBanRepository,
        @inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @inject(TYPES.Logger) private logger: ILogger,
    ) {
        super();
    }

    /**
     * Retrieves all members of a server.
     * Enforces server membership.
     */
    @Get('members')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.NOT_MEMBER,
    })
    public async getServerMembers(
        @Path() serverId: string,
        @Request() req: express.Request,
    ): Promise<any[]> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            this.setStatus(403);
            throw new Error(ErrorMessages.SERVER.NOT_MEMBER);
        }

        return await this.serverMemberRepo.findByServerIdWithUserInfo(serverId);
    }

    /**
     * Searches for members in a server by username or display name.
     * Enforces server membership.
     */
    @Get('members/search')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.NOT_MEMBER,
    })
    public async searchMembers(
        @Path() serverId: string,
        @Query() q: string,
        @Request() req: express.Request,
    ): Promise<any[]> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            this.setStatus(403);
            throw new Error(ErrorMessages.SERVER.NOT_MEMBER);
        }

        return await this.serverMemberRepo.searchMembers(serverId, q);
    }

    /**
     * Retrieves details for a specific server member.
     * Enforces server membership.
     */
    @Get('members/{userId}')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.NOT_MEMBER,
    })
    @Response<ErrorResponse>('404', 'Member Not Found', {
        error: ErrorMessages.MEMBER.NOT_FOUND,
    })
    public async getMember(
        @Path() serverId: string,
        @Path() userId: string,
        @Request() req: express.Request,
    ): Promise<any> {
        // @ts-ignore: JWT middleware attaches user object
        const currentUserId = req.user.id;
        const currentMember = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            currentUserId,
        );
        if (!currentMember) {
            this.setStatus(403);
            throw new Error(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            this.setStatus(404);
            throw new Error(ErrorMessages.MEMBER.NOT_FOUND);
        }

        const user = await this.userRepo.findById(userId);
        return { ...member, user: user ? mapUser(user) : null };
    }

    /**
     * Kicks a member from the server.
     * Enforces 'kickMembers' permission and prevents kicking the server owner.
     */
    @Delete('members/{userId}')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.MEMBER.NO_PERMISSION_KICK,
    })
    @Response<ErrorResponse>('404', 'Member Not Found', {
        error: ErrorMessages.MEMBER.NOT_FOUND,
    })
    public async kickMember(
        @Path() serverId: string,
        @Path() userId: string,
        @Request() req: express.Request,
        @Body() _body: KickMemberRequest,
    ): Promise<{ message: string }> {
        // @ts-ignore: JWT middleware attaches user object
        const currentUserId = req.user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                currentUserId,
                'kickMembers',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.MEMBER.NO_PERMISSION_KICK);
        }

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            this.setStatus(404);
            throw new Error(ErrorMessages.MEMBER.NOT_FOUND);
        }

        // Prevent kicking the server owner, even by users with administrative permissions
        const server = await this.serverRepo.findById(serverId);
        if (server?.ownerId.toString() === userId) {
            this.setStatus(403);
            throw new Error(ErrorMessages.MEMBER.CANNOT_KICK_OWNER);
        }

        await this.serverMemberRepo.remove(serverId, userId);

        const io = getIO();
        io.to(`server:${serverId}`).emit('member_removed', {
            serverId,
            userId,
        });

        return { message: 'Member kicked' };
    }

    /**
     * Bans a member from the server.
     * Enforces 'banMembers' permission and prevents banning the server owner.
     */
    @Post('bans')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.MEMBER.NO_PERMISSION_BAN,
    })
    public async banMember(
        @Path() serverId: string,
        @Request() req: express.Request,
        @Body() body: BanMemberRequest & { userId: string },
    ): Promise<{ message: string }> {
        // @ts-ignore: JWT middleware attaches user object
        const currentUserId = req.user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                currentUserId,
                'banMembers',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.MEMBER.NO_PERMISSION_BAN);
        }

        const { userId, reason } = body;

        // Prevent banning the server owner, even by users with administrative permissions
        const server = await this.serverRepo.findById(serverId);
        if (server?.ownerId.toString() === userId) {
            this.setStatus(403);
            throw new Error(ErrorMessages.MEMBER.CANNOT_BAN_OWNER);
        }

        // Ban workflow: record ban, remove member, notify clients
        await this.serverBanRepo.create({
            serverId,
            userId,
            reason: reason || 'No reason provided',
            bannedBy: currentUserId,
        });

        // Automatically remove the member from the server upon banning
        await this.serverMemberRepo.remove(serverId, userId);

        const io = getIO();
        io.to(`server:${serverId}`).emit('member_removed', {
            serverId,
            userId,
        });
        io.to(`server:${serverId}`).emit('member_banned', { serverId, userId });

        return { message: 'Member banned' };
    }

    /**
     * Unbans a user from the server.
     * Enforces 'banMembers' permission.
     */
    @Delete('bans/{userId}')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.MEMBER.NO_PERMISSION_UNBAN,
    })
    public async unbanMember(
        @Path() serverId: string,
        @Path() userId: string,
        @Request() req: express.Request,
    ): Promise<{ message: string }> {
        // @ts-ignore: JWT middleware attaches user object
        const currentUserId = req.user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                currentUserId,
                'banMembers',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.MEMBER.NO_PERMISSION_UNBAN);
        }

        await this.serverBanRepo.unban(serverId, userId);

        const io = getIO();
        io.to(`server:${serverId}`).emit('member_unbanned', {
            serverId,
            userId,
        });

        return { message: 'Member unbanned' };
    }

    /**
     * Retrieves all active bans for a server.
     * Enforces 'banMembers' permission.
     */
    @Get('bans')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.MEMBER.NO_PERMISSION_VIEW_BANS,
    })
    public async getBans(
        @Path() serverId: string,
        @Request() req: express.Request,
    ): Promise<any[]> {
        // @ts-ignore: JWT middleware attaches user object
        const currentUserId = req.user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                currentUserId,
                'banMembers',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.MEMBER.NO_PERMISSION_VIEW_BANS);
        }

        return await this.serverBanRepo.findByServerId(serverId);
    }

    /**
     * Add a role to a member.
     */
    @Post('members/{userId}/roles/{roleId}')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
    })
    @Response<ErrorResponse>('404', 'Not Found', {
        error: ErrorMessages.MEMBER.NOT_FOUND,
    })
    public async addMemberRole(
        @Path() serverId: string,
        @Path() userId: string,
        @Path() roleId: string,
        @Request() req: express.Request,
    ): Promise<IServerMember> {
        // @ts-ignore
        const currentUserId = req.user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                currentUserId,
                'manageRoles',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES);
        }

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            this.setStatus(404);
            throw new Error(ErrorMessages.MEMBER.NOT_FOUND);
        }

        const role = await this.roleRepo.findById(roleId);
        if (!role || role.serverId.toString() !== serverId) {
            this.setStatus(404);
            throw new Error(ErrorMessages.ROLE.NOT_FOUND);
        }

        if (member.roles.includes(roleId)) {
            return member;
        }

        const updatedMember = await this.serverMemberRepo.addRole(
            serverId,
            userId,
            roleId,
        );

        const io = getIO();
        io.to(`server:${serverId}`).emit('member_updated', {
            serverId,
            userId,
            member: updatedMember,
        });

        return updatedMember;
    }

    /**
     * Remove a role from a member.
     */
    @Delete('members/{userId}/roles/{roleId}')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
    })
    @Response<ErrorResponse>('404', 'Not Found', {
        error: ErrorMessages.MEMBER.NOT_FOUND,
    })
    public async removeMemberRole(
        @Path() serverId: string,
        @Path() userId: string,
        @Path() roleId: string,
        @Request() req: express.Request,
    ): Promise<IServerMember> {
        // @ts-ignore
        const currentUserId = req.user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                currentUserId,
                'manageRoles',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES);
        }

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            this.setStatus(404);
            throw new Error(ErrorMessages.MEMBER.NOT_FOUND);
        }

        const updatedMember = await this.serverMemberRepo.removeRole(
            serverId,
            userId,
            roleId,
        );

        const io = getIO();
        io.to(`server:${serverId}`).emit('member_updated', {
            serverId,
            userId,
            member: updatedMember,
        });

        return updatedMember;
    }

    /**
     * Removes the current user from the server.
     * Enforces that the server owner cannot leave without transferring ownership.
     */
    @Delete('members/me')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.OWNER_CANNOT_LEAVE,
    })
    public async leaveServer(
        @Path() serverId: string,
        @Request() req: express.Request,
    ): Promise<{ message: string }> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        const server = await this.serverRepo.findById(serverId);
        if (server?.ownerId.toString() === userId) {
            this.setStatus(403);
            throw new Error(ErrorMessages.SERVER.OWNER_CANNOT_LEAVE);
        }

        await this.serverMemberRepo.remove(serverId, userId);

        const io = getIO();
        io.to(`server:${serverId}`).emit('member_removed', {
            serverId,
            userId,
        });

        return { message: 'Left server' };
    }

    /**
     * Transfers server ownership to another member.
     * Enforces that only the current owner can perform this action.
     */
    @Post('transfer-ownership')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.TRANSFER_OWNERSHIP_ONLY_OWNER,
    })
    @Response<ErrorResponse>('404', 'Member Not Found', {
        error: ErrorMessages.MEMBER.NOT_FOUND,
    })
    public async transferOwnership(
        @Path() serverId: string,
        @Request() req: express.Request,
        @Body() body: TransferOwnershipRequest,
    ): Promise<{ message: string }> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        const server = await this.serverRepo.findById(serverId);
        if (!server) {
            this.setStatus(404);
            throw new Error('Server not found');
        }

        if (server.ownerId.toString() !== userId) {
            this.setStatus(403);
            throw new Error(ErrorMessages.SERVER.TRANSFER_OWNERSHIP_ONLY_OWNER);
        }

        const { newOwnerId } = body;
        const newOwnerMember = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            newOwnerId,
        );
        if (!newOwnerMember) {
            this.setStatus(404);
            throw new Error(ErrorMessages.MEMBER.NOT_FOUND);
        }

        // Ownership transfer is atomic at the server level; permissions are implicitly updated
        await this.serverRepo.update(serverId, { ownerId: newOwnerId });

        const io = getIO();
        io.to(`server:${serverId}`).emit('server_updated', {
            serverId,
            server: { ...server, ownerId: newOwnerId },
        });

        return { message: 'Ownership transferred' };
    }
}
