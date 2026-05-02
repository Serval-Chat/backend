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
import type { IServerAuditLogService } from '@/di/interfaces/IServerAuditLogService';
import type { IBlockRepository } from '@/di/interfaces/IBlockRepository';
import { BlockFlags } from '@/privacy/blockFlags';

import { mapUser } from '@/utils/user';
import type { Request as ExpressRequest } from 'express';
import { JWTPayload } from '@/utils/jwt';
import { MappedUser } from '@/utils/user';
import { IServerBan } from '@/di/interfaces/IServerBanRepository';
import { IUser } from '@/models/User';
import { Bot } from '@/models/Bot';
import { Role } from '@/models/Server';
import { ErrorMessages } from '@/constants/errorMessages';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import {
    KickMemberRequestDTO,
    BanMemberRequestDTO,
    TransferOwnershipRequestDTO,
    TimeoutMemberRequestDTO,
} from './dto/server-member.request.dto';

@injectable()
@Controller('api/v1/servers/:serverId')
@ApiTags('Server Members')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ServerMemberController {
    public constructor(
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
        @Inject(TYPES.ServerAuditLogService)
        private serverAuditLogService: IServerAuditLogService,
        @Inject(TYPES.BlockRepository)
        private blockRepo: IBlockRepository,
    ) { }

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
        if (member === null) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const members =
            await this.serverMemberRepo.findByServerIdWithUserInfo(serverOid);

        const [blocksByA, blocksAgainstA] = await Promise.all([
            this.blockRepo.findBlocksByBlocker(userOid),
            this.blockRepo.findBlocksByTarget(userOid),
        ]);

        const hideEntirelySet = new Set(
            blocksByA
                .filter((b) => b.flags & BlockFlags.HIDE_FROM_MEMBER_LIST)
                .map((b) => b.targetId),
        );

        const hidePresenceByA = new Set(
            blocksByA
                .filter((b) => b.flags & BlockFlags.HIDE_THEIR_PRESENCE)
                .map((b) => b.targetId),
        );

        const hidePresenceAgainstA = new Set(
            blocksAgainstA
                .filter((b) => b.flags & BlockFlags.HIDE_MY_PRESENCE)
                .map((b) => b.blockerId),
        );

        const filteredMembers = members.filter(
            (m) => !hideEntirelySet.has(m.userId.toString()),
        );

        return Promise.all(
            filteredMembers.map(async (m) => {
                const targetUserIdStr = m.userId.toString();
                const shouldHidePresence =
                    hidePresenceByA.has(targetUserIdStr) ||
                    hidePresenceAgainstA.has(targetUserIdStr);

                return {
                    ...m,
                    online: shouldHidePresence
                        ? false
                        : await this.wsServer.isUserOnline(targetUserIdStr),
                };
            }),
        );
    }

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
        if (member === null) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const members = await this.serverMemberRepo.searchMembers(serverOid, q);

        const [blocksByA, blocksAgainstA] = await Promise.all([
            this.blockRepo.findBlocksByBlocker(userOid),
            this.blockRepo.findBlocksByTarget(userOid),
        ]);

        const hideEntirelySet = new Set(
            blocksByA
                .filter((b) => b.flags & BlockFlags.HIDE_FROM_MENTIONS)
                .map((b) => b.targetId),
        );

        const hidePresenceByA = new Set(
            blocksByA
                .filter((b) => b.flags & BlockFlags.HIDE_THEIR_PRESENCE)
                .map((b) => b.targetId),
        );

        const hidePresenceAgainstA = new Set(
            blocksAgainstA
                .filter((b) => b.flags & BlockFlags.HIDE_MY_PRESENCE)
                .map((b) => b.blockerId),
        );

        const filteredMembers = members.filter(
            (m) => !hideEntirelySet.has(m.userId.toString()),
        );

        return Promise.all(
            filteredMembers.map(async (m) => {
                const targetUserIdStr = m.userId.toString();
                const shouldHidePresence =
                    hidePresenceByA.has(targetUserIdStr) ||
                    hidePresenceAgainstA.has(targetUserIdStr);

                return {
                    ...m,
                    online: shouldHidePresence
                        ? false
                        : await this.wsServer.isUserOnline(targetUserIdStr),
                };
            }),
        );
    }

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
        if (currentMember === null) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            targetOid,
        );
        if (member === null) {
            throw new NotFoundException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        const user = await this.userRepo.findById(targetOid);
        return { ...member, user: user ? mapUser(user as IUser) : null };
    }

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
        if (server && server.ownerId.equals(userOid)) {
            throw new ForbiddenException(
                ErrorMessages.SERVER.OWNER_CANNOT_LEAVE,
            );
        }

        await this.serverMemberRepo.remove(serverOid, userOid);
        await this.cleanupManagedRole(serverOid, userOid);
        this.permissionService.invalidateCache(serverOid);

        this.wsServer.broadcastToServer(serverId, {
            type: 'member_removed',
            payload: { serverId, userId },
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverOid,
            actorId: userOid,
            actionType: 'user_leave',
            targetId: userOid,
            targetType: 'user',
            targetUserId: userOid,
        });

        return { message: 'Left server' };
    }

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
            (await this.permissionService.hasPermission(
                serverOid,
                currentOid,
                'kickMembers',
            )) !== true
        ) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_KICK,
            );
        }

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            targetOid,
        );
        if (member === null) {
            throw new NotFoundException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        const server = await this.serverRepo.findById(serverOid);
        if (server && server.ownerId.equals(targetOid)) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.CANNOT_KICK_OWNER,
            );
        }

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
        await this.cleanupManagedRole(serverOid, targetOid);
        this.permissionService.invalidateCache(serverOid);

        this.wsServer.broadcastToServer(serverId, {
            type: 'member_removed',
            payload: { serverId, userId },
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverOid,
            actorId: currentOid,
            actionType: 'user_kick',
            targetId: targetOid,
            targetType: 'user',
            targetUserId: targetOid,
            reason: _body.reason,
        });

        return { message: 'Member kicked' };
    }

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

        const server = await this.serverRepo.findById(serverOid);
        if (server && server.ownerId.equals(targetOid)) {
            throw new ForbiddenException(ErrorMessages.MEMBER.CANNOT_BAN_OWNER);
        }

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

        await this.serverBanRepo.create({
            serverId: serverOid,
            userId: targetOid,
            reason: (reason !== undefined && reason !== '') ? reason : 'No reason provided',
            bannedBy: currentOid,
        });

        await this.serverMemberRepo.remove(serverOid, targetOid);
        await this.cleanupManagedRole(serverOid, targetOid);
        this.permissionService.invalidateCache(serverOid);

        this.wsServer.broadcastToServer(serverId, {
            type: 'member_removed',
            payload: { serverId, userId },
        });
        this.wsServer.broadcastToServer(serverId, {
            type: 'member_banned',
            payload: { serverId, userId },
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverOid,
            actorId: currentOid,
            actionType: 'user_ban',
            targetId: targetOid,
            targetType: 'user',
            targetUserId: targetOid,
            reason: reason,
        });

        return { message: 'Member banned' };
    }

    @Post('members/:userId/timeout')
    @ApiOperation({ summary: 'Timeout a member' })
    @ApiResponse({ status: 200, description: 'Member timed out' })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
    })
    public async timeoutMember(
        @Param('serverId') serverId: string,
        @Param('userId') userId: string,
        @Req() req: ExpressRequest,
        @Body() body: TimeoutMemberRequestDTO,
    ): Promise<{ message: string; communicationDisabledUntil: string | null }> {
        const currentUserId = (req as ExpressRequest & { user: JWTPayload })
            .user.id;
        const serverOid = new Types.ObjectId(serverId);
        const currentOid = new Types.ObjectId(currentUserId);
        const targetOid = new Types.ObjectId(userId);
        const { duration, reason } = body;

        if (
            (await this.permissionService.hasPermission(
                serverOid,
                currentOid,
                'moderateMembers',
            )) !== true
        ) {
            throw new ForbiddenException(
                'You do not have permission to timeout members',
            );
        }

        const server = await this.serverRepo.findById(serverOid);
        if (server !== null && server.ownerId.equals(targetOid)) {
            throw new ForbiddenException('You cannot timeout the server owner');
        }

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
                'You cannot timeout a member with a role equal to or higher than your own',
            );
        }

        const until = (duration !== undefined && duration > 0) 
            ? new Date(Date.now() + duration * 1000) 
            : null;

        const updatedMember = await this.serverMemberRepo.setTimeout(
            serverOid,
            targetOid,
            until,
        );

        if (updatedMember === null) {
            throw new NotFoundException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        this.wsServer.broadcastToServer(serverId, {
            type: 'member_updated',
            payload: {
                serverId,
                userId,
                member: updatedMember,
            },
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverOid,
            actorId: currentOid,
            actionType: until ? 'user_timeout' : 'user_timeout_remove',
            targetId: targetOid,
            targetType: 'user',
            targetUserId: targetOid,
            reason: (reason !== undefined && reason !== '') ? reason : 'No reason provided',
            metadata: {
                durationSeconds: duration,
                until: until ? until.toISOString() : undefined,
            },
        });

        return { 
            message: until ? 'Member timed out' : 'Timeout removed', 
            communicationDisabledUntil: until ? until.toISOString() : null 
        };
    }

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
            (await this.permissionService.hasPermission(
                serverOid,
                currentOid,
                'banMembers',
            )) !== true
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

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverOid,
            actorId: currentOid,
            actionType: 'user_unban',
            targetId: targetOid,
            targetType: 'user',
            targetUserId: targetOid,
        });

        return { message: 'Member unbanned' };
    }

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
            (await this.permissionService.hasPermission(
                serverOid,
                currentOid,
                'banMembers',
            )) !== true
        ) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_VIEW_BANS,
            );
        }

        return await this.serverBanRepo.findByServerIdWithUserInfo(serverOid);
    }

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
            (await this.permissionService.hasPermission(
                serverOid,
                currentOid,
                'manageRoles',
            )) !== true
        ) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
            );
        }

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            targetOid,
        );
        if (member === null) {
            throw new NotFoundException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        const role = await this.roleRepo.findById(roleOid);
        if (role === null || role.serverId.equals(serverOid) === false) {
            throw new NotFoundException(ErrorMessages.ROLE.NOT_FOUND);
        }

        const server = await this.serverRepo.findById(serverOid);
        const isOwner = server !== null && server.ownerId.equals(currentOid);

        if (isOwner !== true) {
            const currentUserHighest = await this.permissionService.getHighestRolePosition(serverOid, currentOid);
            const targetHighest = await this.permissionService.getHighestRolePosition(serverOid, targetOid);

            if (currentUserHighest <= targetHighest) {
                throw new ForbiddenException('You cannot manage roles for a member with a role equal to or higher than your own');
            }

            if (currentUserHighest <= role.position) {
                throw new ForbiddenException('You cannot assign a role equal to or higher than your own highest role');
            }
        }

        if (member.roles.some((r) => r.equals(roleOid))) {
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

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverOid,
            actorId: currentOid,
            actionType: 'role_given',
            targetId: roleOid,
            targetType: 'role',
            targetUserId: targetOid,
            metadata: { roleName: role.name },
        });

        return updatedMember;
    }

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
            (await this.permissionService.hasPermission(
                serverOid,
                currentOid,
                'manageRoles',
            )) !== true
        ) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
            );
        }

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            targetOid,
        );
        if (member === null) {
            throw new NotFoundException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        const role = await this.roleRepo.findById(roleOid);
        if (role === null || role.serverId.equals(serverOid) === false) {
            throw new NotFoundException(ErrorMessages.ROLE.NOT_FOUND);
        }
        if (role.managed === true) {
            throw new ForbiddenException('Cannot remove a managed role from a member');
        }

        const server = await this.serverRepo.findById(serverOid);
        const isOwner = server !== null && server.ownerId.equals(currentOid);

        if (isOwner !== true) {
            const currentUserHighest = await this.permissionService.getHighestRolePosition(serverOid, currentOid);
            const targetHighest = await this.permissionService.getHighestRolePosition(serverOid, targetOid);

            if (currentUserHighest <= targetHighest) {
                throw new ForbiddenException('You cannot manage roles for a member with a role equal to or higher than your own');
            }

            if (currentUserHighest <= role.position) {
                throw new ForbiddenException('You cannot remove a role equal to or higher than your own highest role');
            }
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



        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverOid,
            actorId: currentOid,
            actionType: 'role_removed',
            targetId: roleOid,
            targetType: 'role',
            targetUserId: targetOid,
            metadata: { roleName: role.name },
        });

        return updatedMember;
    }

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

        if (server.ownerId.equals(userOid) === false) {
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

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverOid,
            actorId: userOid,
            actionType: 'owner_changed',
            targetId: serverOid,
            targetType: 'server',
            targetUserId: newOwnerOid,
        });

        return { message: 'Ownership transferred' };
    }

    private async cleanupManagedRole(serverId: Types.ObjectId, userId: Types.ObjectId) {
        try {
            const bot = await Bot.findOne({ userId }).lean();
            if (bot) {
                const managedRole = await Role.findOne({
                    serverId,
                    managed: true,
                    managedBotId: bot._id
                }).lean();

                if (managedRole) {
                    await this.roleRepo.delete(managedRole._id as Types.ObjectId);
                    this.wsServer.broadcastToServer(serverId.toString(), {
                        type: 'role_deleted',
                        payload: { serverId: serverId.toString(), roleId: managedRole._id.toString() },
                    });
                }
            }
        } catch (err) {
            this.logger.error('Failed to cleanup managed role', err);
        }
    }
}
