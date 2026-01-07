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
    BadRequestException,
    ConflictException,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
} from '@nestjs/swagger';
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
        @inject(TYPES.ServerMemberRepository)
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @inject(TYPES.ServerRepository)
        @Inject(TYPES.ServerRepository)
        private serverRepo: IServerRepository,
        @inject(TYPES.UserRepository)
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
        @inject(TYPES.RoleRepository)
        @Inject(TYPES.RoleRepository)
        private roleRepo: IRoleRepository,
        @inject(TYPES.ServerBanRepository)
        @Inject(TYPES.ServerBanRepository)
        private serverBanRepo: IServerBanRepository,
        @inject(TYPES.PermissionService)
        @Inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @inject(TYPES.Logger)
        @Inject(TYPES.Logger)
        private logger: ILogger,
    ) {}

    // Retrieves all members of a server
    // Enforces server membership
    @Get('members')
    @ApiOperation({ summary: 'Get all server members' })
    @ApiResponse({ status: 200, description: 'Server members retrieved' })
    @ApiResponse({ status: 403, description: ErrorMessages.SERVER.NOT_MEMBER })
    public async getServerMembers(
        @Param('serverId') serverId: string,
        @Req() req: ExpressRequest,
    ): Promise<(IServerMember & { user: MappedUser | null })[]> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        return await this.serverMemberRepo.findByServerIdWithUserInfo(serverId);
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
    ): Promise<(IServerMember & { user: MappedUser | null })[]> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        return await this.serverMemberRepo.searchMembers(serverId, q);
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
        const currentMember = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            currentUserId,
        );
        if (!currentMember) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            throw new NotFoundException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        const user = await this.userRepo.findById(userId);
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
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                currentUserId,
                'kickMembers',
            ))
        ) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_KICK,
            );
        }

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            throw new NotFoundException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        // Prevent kicking the server owner, even by users with administrative permissions
        const server = await this.serverRepo.findById(serverId);
        if (server?.ownerId.toString() === userId) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.CANNOT_KICK_OWNER,
            );
        }

        await this.serverMemberRepo.remove(serverId, userId);

        const io = getIO();
        io.to(`server:${serverId}`).emit('member_removed', {
            serverId,
            userId,
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
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                currentUserId,
                'banMembers',
            ))
        ) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_BAN,
            );
        }

        const { userId, reason } = body;

        // Prevent banning the server owner, even by users with administrative permissions
        const server = await this.serverRepo.findById(serverId);
        if (server?.ownerId.toString() === userId) {
            throw new ForbiddenException(ErrorMessages.MEMBER.CANNOT_BAN_OWNER);
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
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                currentUserId,
                'banMembers',
            ))
        ) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_UNBAN,
            );
        }

        await this.serverBanRepo.unban(serverId, userId);

        const io = getIO();
        io.to(`server:${serverId}`).emit('member_unbanned', {
            serverId,
            userId,
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
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                currentUserId,
                'banMembers',
            ))
        ) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_VIEW_BANS,
            );
        }

        return await this.serverBanRepo.findByServerId(serverId);
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
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                currentUserId,
                'manageRoles',
            ))
        ) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
            );
        }

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            throw new NotFoundException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        const role = await this.roleRepo.findById(roleId);
        if (!role || role.serverId.toString() !== serverId) {
            throw new NotFoundException(ErrorMessages.ROLE.NOT_FOUND);
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
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                currentUserId,
                'manageRoles',
            ))
        ) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
            );
        }

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            throw new NotFoundException(ErrorMessages.MEMBER.NOT_FOUND);
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
        const server = await this.serverRepo.findById(serverId);
        if (server?.ownerId.toString() === userId) {
            throw new ForbiddenException(
                ErrorMessages.SERVER.OWNER_CANNOT_LEAVE,
            );
        }

        await this.serverMemberRepo.remove(serverId, userId);

        const io = getIO();
        io.to(`server:${serverId}`).emit('member_removed', {
            serverId,
            userId,
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
        const server = await this.serverRepo.findById(serverId);
        if (!server) {
            throw new NotFoundException('Server not found');
        }

        if (server.ownerId.toString() !== userId) {
            throw new ForbiddenException(
                ErrorMessages.SERVER.TRANSFER_OWNERSHIP_ONLY_OWNER,
            );
        }

        const { newOwnerId } = body;
        const newOwnerMember = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            newOwnerId,
        );
        if (!newOwnerMember) {
            throw new NotFoundException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        await this.serverRepo.update(serverId, { ownerId: newOwnerId });

        const io = getIO();
        io.to(`server:${serverId}`).emit('ownership_transferred', {
            serverId,
            oldOwnerId: userId,
            newOwnerId,
        });

        return { message: 'Ownership transferred' };
    }
}
