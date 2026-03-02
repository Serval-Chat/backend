import {
    Controller,
    Get,
    Post,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    Req,
    Inject,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
} from '@nestjs/swagger';
import { WsServer } from '@/ws/server';
import { injectable } from 'inversify';
import { TYPES } from '@/di/types';
import type {
    IServerMemberRepository,
    IServerMember,
} from '@/di/interfaces/IServerMemberRepository';
import type { IServerRepository } from '@/di/interfaces/IServerRepository';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type { IRoleRepository } from '@/di/interfaces/IRoleRepository';
import type { IServerBanRepository } from '@/di/interfaces/IServerBanRepository';
import { PermissionService } from '@/permissions/PermissionService';
import type { ILogger } from '@/di/interfaces/ILogger';

import { mapUser } from '@/utils/user';
import type { Request as ExpressRequest } from 'express';
import { JWTPayload } from '@/utils/jwt';
import { MappedUser } from '@/utils/user';
import { IServerBan } from '@/di/interfaces/IServerBanRepository';
import { IUser } from '@/models/User';
import { ErrorMessages } from '@/constants/errorMessages';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import {
    KickMemberRequestDTO,
    BanMemberRequestDTO,
    TransferOwnershipRequestDTO,
} from './dto/server-member.request.dto';

// Controller for managing server members, including kicks, bans, and role assignments
// Enforces permission checks and prevents actions against server owners
@injectable()
@Controller('api/v1/servers/:serverId')
@ApiTags('Server Members')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ServerMemberController {
    constructor(
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @Inject(TYPES.ServerRepository)
        private serverRepo: IServerRepository,
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
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
    ) { }

    // Retrieves all members of a server
    // Enforces server membership
    @Get('members')
    @ApiOperation({ summary: 'Get all server members' })
    @ApiResponse({ status: 200, description: 'Server members retrieved' })
    @ApiResponse({ status: 403, description: ErrorMessages.SERVER.NOT_MEMBER })
    public async getServerMembers(
        @Param('serverId') serverId: string,
        @Req() req: ExpressRequest,
    ): Promise<
        (IServerMember & { user: MappedUser | null; online: boolean })[]
    > {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            userOid,
        );
        if (!member) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const members =
            await this.serverMemberRepo.findByServerIdWithUserInfo(serverOid);
        
        return members.map((m) => ({
            ...m,
            online: this.wsServer.isUserOnline(m.userId.toString()),
        }));
    }

    // Searches for members in a server by username or display name
    // Enforces server membership
    @Get('members/search')
    @ApiOperation({ summary: 'Search server members' })
    @ApiResponse({ status: 200, description: 'Search results' })
    @ApiResponse({ status: 403, description: ErrorMessages.SERVER.NOT_MEMBER })
    public async searchMembers(
        @Param('serverId') serverId: string,
        @Query('q') q: string,
        @Req() req: ExpressRequest,
    ): Promise<
        (IServerMember & { user: MappedUser | null; online: boolean })[]
    > {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            userOid,
        );
        if (!member) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const members = await this.serverMemberRepo.searchMembers(serverOid, q);
        return members.map((m) => ({
            ...m,
            online: this.wsServer.isUserOnline(m.userId.toString()),
        }));
    }

    // Retrieves details for a specific server member
    // Enforces server membership
    @Get('members/:userId')
    @ApiOperation({ summary: 'Get server member details' })
    @ApiResponse({ status: 200, description: 'Member details retrieved' })
    @ApiResponse({ status: 403, description: ErrorMessages.SERVER.NOT_MEMBER })
    @ApiResponse({ status: 404, description: ErrorMessages.MEMBER.NOT_FOUND })
    public async getMember(
        @Param('serverId') serverId: string,
        @Param('userId') userId: string,
        @Req() req: ExpressRequest,
    ): Promise<IServerMember & { user: MappedUser | null }> {
        const currentUserId = (req as ExpressRequest & { user: JWTPayload })
            .user.id;
        const serverOid = new Types.ObjectId(serverId);
        const currentOid = new Types.ObjectId(currentUserId);
        const targetOid = new Types.ObjectId(userId);
        const currentMember = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            currentOid,
        );
        if (!currentMember) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            targetOid,
        );
        if (!member) {
            throw new NotFoundException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        const user = await this.userRepo.findById(targetOid);
        return { ...member, user: user ? mapUser(user as IUser) : null };
    }

    // Kicks a member from the server
    // Enforces 'kickMembers' permission and prevents actions against server owner
    @Delete('members/:userId')
    @ApiOperation({ summary: 'Kick a member from the server' })
    @ApiResponse({ status: 200, description: 'Member kicked' })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.MEMBER.NO_PERMISSION_KICK,
    })
    @ApiResponse({ status: 404, description: ErrorMessages.MEMBER.NOT_FOUND })
    public async kickMember(
        @Param('serverId') serverId: string,
        @Param('userId') userId: string,
        @Req() req: ExpressRequest,
        @Body() _body: KickMemberRequestDTO,
    ): Promise<{ message: string }> {
        const currentUserId = (req as ExpressRequest & { user: JWTPayload })
            .user.id;
        const serverOid = new Types.ObjectId(serverId);
        const currentOid = new Types.ObjectId(currentUserId);
        const targetOid = new Types.ObjectId(userId);
        if (
            !(await this.permissionService.hasPermission(
                serverOid,
                currentOid,
                'kickMembers',
            ))
        ) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_KICK,
            );
        }

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            targetOid,
        );
        if (!member) {
            throw new NotFoundException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        // Prevent kicking the server owner, even by users with administrative permissions
        const server = await this.serverRepo.findById(serverOid);
        if (server?.ownerId.equals(targetOid)) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.CANNOT_KICK_OWNER,
            );
        }

        // Enforce role hierarchy: cannot kick someone with equal or higher role
        const currentUserHighest =
            await this.permissionService.getHighestRolePosition(
                serverOid,
                currentOid,
            );
        const targetHighest =
            await this.permissionService.getHighestRolePosition(
                serverOid,
                targetOid,
            );

        if (currentUserHighest <= targetHighest) {
            throw new ForbiddenException(
                'You cannot kick a member with a role equal to or higher than your own',
            );
        }

        await this.serverMemberRepo.remove(serverOid, targetOid);

        this.wsServer.broadcastToServer(serverId, {
            type: 'member_removed',
            payload: { serverId, userId },
        });

        return { message: 'Member kicked' };
    }

    // Bans a member from the server
    // Enforces 'banMembers' permission and prevents banning the server owner
    @Post('bans')
    @ApiOperation({ summary: 'Ban a member from the server' })
    @ApiResponse({ status: 200, description: 'Member banned' })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.MEMBER.NO_PERMISSION_BAN,
    })
    public async banMember(
        @Param('serverId') serverId: string,
        @Req() req: ExpressRequest,
        @Body() body: BanMemberRequestDTO,
    ): Promise<{ message: string }> {
        const currentUserId = (req as ExpressRequest & { user: JWTPayload })
            .user.id;
        const serverOid = new Types.ObjectId(serverId);
        const currentOid = new Types.ObjectId(currentUserId);
        const { userId, reason } = body;
        const targetOid = new Types.ObjectId(userId);

        if (
            !(await this.permissionService.hasPermission(
                serverOid,
                currentOid,
                'banMembers',
            ))
        ) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_BAN,
            );
        }

        // Prevent banning the server owner, even by users with administrative permissions
        const server = await this.serverRepo.findById(serverOid);
        if (server?.ownerId.equals(targetOid)) {
            throw new ForbiddenException(ErrorMessages.MEMBER.CANNOT_BAN_OWNER);
        }

        // Enforce role hierarchy: cannot ban someone with equal or higher role
        const currentUserHighest =
            await this.permissionService.getHighestRolePosition(
                serverOid,
                currentOid,
            );
        const targetHighest =
            await this.permissionService.getHighestRolePosition(
                serverOid,
                targetOid,
            );

        if (currentUserHighest <= targetHighest) {
            throw new ForbiddenException(
                'You cannot ban a member with a role equal to or higher than your own',
            );
        }

        // Ban workflow: record ban, remove member, notify clients
        await this.serverBanRepo.create({
            serverId: serverOid,
            userId: targetOid,
            reason: reason || 'No reason provided',
            bannedBy: currentOid,
        });

        // Automatically remove the member from the server upon banning
        await this.serverMemberRepo.remove(serverOid, targetOid);

        this.wsServer.broadcastToServer(serverId, {
            type: 'member_removed',
            payload: { serverId, userId },
        });
        this.wsServer.broadcastToServer(serverId, {
            type: 'member_banned',
            payload: { serverId, userId },
        });

        return { message: 'Member banned' };
    }

    // Unbans a user from the server
    // Enforces 'banMembers' permission
    @Delete('bans/:userId')
    @ApiOperation({ summary: 'Unban a user from the server' })
    @ApiResponse({ status: 200, description: 'Member unbanned' })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.MEMBER.NO_PERMISSION_UNBAN,
    })
    public async unbanMember(
        @Param('serverId') serverId: string,
        @Param('userId') userId: string,
        @Req() req: ExpressRequest,
    ): Promise<{ message: string }> {
        const currentUserId = (req as ExpressRequest & { user: JWTPayload })
            .user.id;
        const serverOid = new Types.ObjectId(serverId);
        const currentOid = new Types.ObjectId(currentUserId);
        const targetOid = new Types.ObjectId(userId);
        if (
            !(await this.permissionService.hasPermission(
                serverOid,
                currentOid,
                'banMembers',
            ))
        ) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_UNBAN,
            );
        }

        await this.serverBanRepo.unban(serverOid, targetOid);

        this.wsServer.broadcastToServer(serverId, {
            type: 'member_unbanned',
            payload: { serverId, userId },
        });

        return { message: 'Member unbanned' };
    }

    // Retrieves all active bans for a server
    // Enforces 'banMembers' permission
    @Get('bans')
    @ApiOperation({ summary: 'Get all server bans' })
    @ApiResponse({ status: 200, description: 'Server bans retrieved' })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.MEMBER.NO_PERMISSION_VIEW_BANS,
    })
    public async getBans(
        @Param('serverId') serverId: string,
        @Req() req: ExpressRequest,
    ): Promise<IServerBan[]> {
        const currentUserId = (req as ExpressRequest & { user: JWTPayload })
            .user.id;
        const serverOid = new Types.ObjectId(serverId);
        const currentOid = new Types.ObjectId(currentUserId);
        if (
            !(await this.permissionService.hasPermission(
                serverOid,
                currentOid,
                'banMembers',
            ))
        ) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_VIEW_BANS,
            );
        }

        return await this.serverBanRepo.findByServerIdWithUserInfo(serverOid);
    }

    // Add a role to a member
    @Post('members/:userId/roles/:roleId')
    @ApiOperation({ summary: 'Add a role to a member' })
    @ApiResponse({ status: 200, description: 'Role added' })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
    })
    @ApiResponse({ status: 404, description: ErrorMessages.MEMBER.NOT_FOUND })
    public async addMemberRole(
        @Param('serverId') serverId: string,
        @Param('userId') userId: string,
        @Param('roleId') roleId: string,
        @Req() req: ExpressRequest,
    ): Promise<IServerMember> {
        const currentUserId = (req as ExpressRequest & { user: JWTPayload })
            .user.id;
        const serverOid = new Types.ObjectId(serverId);
        const currentOid = new Types.ObjectId(currentUserId);
        const targetOid = new Types.ObjectId(userId);
        const roleOid = new Types.ObjectId(roleId);
        if (
            !(await this.permissionService.hasPermission(
                serverOid,
                currentOid,
                'manageRoles',
            ))
        ) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
            );
        }

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            targetOid,
        );
        if (!member) {
            throw new NotFoundException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        const role = await this.roleRepo.findById(roleOid);
        if (!role || !role.serverId.equals(serverOid)) {
            throw new NotFoundException(ErrorMessages.ROLE.NOT_FOUND);
        }

        if (member.roles.some(r => r.equals(roleOid))) {
            return member;
        }

        const updatedMember = await this.serverMemberRepo.addRole(
            serverOid,
            targetOid,
            roleOid,
        );

        this.permissionService.invalidateCache(serverOid);

        this.wsServer.broadcastToServer(serverId, {
            type: 'member_updated',
            payload: {
                serverId,
                userId,
                member: updatedMember,
            },
        });

        return updatedMember;
    }

    // Remove a role from a member
    @Delete('members/:userId/roles/:roleId')
    @ApiOperation({ summary: 'Remove a role from a member' })
    @ApiResponse({ status: 200, description: 'Role removed' })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
    })
    @ApiResponse({ status: 404, description: ErrorMessages.MEMBER.NOT_FOUND })
    public async removeMemberRole(
        @Param('serverId') serverId: string,
        @Param('userId') userId: string,
        @Param('roleId') roleId: string,
        @Req() req: ExpressRequest,
    ): Promise<IServerMember> {
        const currentUserId = (req as ExpressRequest & { user: JWTPayload })
            .user.id;
        const serverOid = new Types.ObjectId(serverId);
        const currentOid = new Types.ObjectId(currentUserId);
        const targetOid = new Types.ObjectId(userId);
        const roleOid = new Types.ObjectId(roleId);
        if (
            !(await this.permissionService.hasPermission(
                serverOid,
                currentOid,
                'manageRoles',
            ))
        ) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
            );
        }

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            targetOid,
        );
        if (!member) {
            throw new NotFoundException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        const updatedMember = await this.serverMemberRepo.removeRole(
            serverOid,
            targetOid,
            roleOid,
        );

        this.permissionService.invalidateCache(serverOid);

        this.wsServer.broadcastToServer(serverId, {
            type: 'member_updated',
            payload: {
                serverId,
                userId,
                member: updatedMember,
            },
        });

        return updatedMember;
    }

    // Removes the current user from the server
    // Enforces that the server owner cannot leave without transferring ownership
    @Delete('members/me')
    @ApiOperation({ summary: 'Leave the server' })
    @ApiResponse({ status: 200, description: 'Left server' })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.SERVER.OWNER_CANNOT_LEAVE,
    })
    public async leaveServer(
        @Param('serverId') serverId: string,
        @Req() req: ExpressRequest,
    ): Promise<{ message: string }> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        const server = await this.serverRepo.findById(serverOid);
        if (server?.ownerId.equals(userOid)) {
            throw new ForbiddenException(
                ErrorMessages.SERVER.OWNER_CANNOT_LEAVE,
            );
        }

        await this.serverMemberRepo.remove(serverOid, userOid);

        this.wsServer.broadcastToServer(serverId, {
            type: 'member_removed',
            payload: { serverId, userId },
        });

        return { message: 'Left server' };
    }

    // Transfers server ownership to another member
    // Enforces that only the current owner can perform this action
    @Post('transfer-ownership')
    @ApiOperation({ summary: 'Transfer server ownership' })
    @ApiResponse({ status: 200, description: 'Ownership transferred' })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.SERVER.TRANSFER_OWNERSHIP_ONLY_OWNER,
    })
    @ApiResponse({ status: 404, description: ErrorMessages.MEMBER.NOT_FOUND })
    public async transferOwnership(
        @Param('serverId') serverId: string,
        @Req() req: ExpressRequest,
        @Body() body: TransferOwnershipRequestDTO,
    ): Promise<{ message: string }> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        const { newOwnerId } = body;
        const newOwnerOid = new Types.ObjectId(newOwnerId);

        const server = await this.serverRepo.findById(serverOid);
        if (!server) {
            throw new NotFoundException('Server not found');
        }

        if (!server.ownerId.equals(userOid)) {
            throw new ForbiddenException(
                ErrorMessages.SERVER.TRANSFER_OWNERSHIP_ONLY_OWNER,
            );
        }

        const newOwnerMember = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            newOwnerOid,
        );
        if (!newOwnerMember) {
            throw new NotFoundException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        await this.serverRepo.update(serverOid, { ownerId: newOwnerOid });

        this.permissionService.invalidateCache(serverOid);

        this.wsServer.broadcastToServer(serverId, {
            type: 'ownership_transferred',
            payload: {
                serverId,
                oldOwnerId: userId,
                newOwnerId: newOwnerId,
            },
        });

        return { message: 'Ownership transferred' };
    }
}