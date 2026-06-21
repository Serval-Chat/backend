import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    Inject,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiOkResponse,
    ApiBearerAuth,
} from '@nestjs/swagger';
import {
    ServerMemberResponseDTO,
    ServerMemberWithUserResponseDTO,
    OnboardingStateResponseDTO,
    ServerMemberListResponseDTO,
    ServerMemberSearchResponseDTO,
    MemberActionResponseDTO,
    TimeoutResponseDTO,
    ServerBanResponseDTO,
    TransferOwnershipResponseDTO,
} from './dto/server-member.response.dto';
import { WsServer } from '@/ws/server';
import { TYPES } from '@/di/types';
import type {
    IServerMemberRepository,
    IServerMember,
} from '@/di/interfaces/IServerMemberRepository';
import type { IServerRepository } from '@/di/interfaces/IServerRepository';
import type { IChannelRepository } from '@/di/interfaces/IChannelRepository';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type { IRoleRepository } from '@/di/interfaces/IRoleRepository';
import type { ICategoryRepository } from '@/di/interfaces/ICategoryRepository';
import type { IServerBanRepository } from '@/di/interfaces/IServerBanRepository';
import { PermissionService } from '@/permissions/PermissionService';
import type { ILogger } from '@/di/interfaces/ILogger';
import type { IServerAuditLogService } from '@/di/interfaces/IServerAuditLogService';
import type { IBlockRepository } from '@/di/interfaces/IBlockRepository';
import { BlockFlags } from '@/privacy/blockFlags';
import { PingService } from '@/services/PingService';

import { mapUser } from '@/utils/user';
import { mapPublicServerMember } from '@/utils/serverMember';
import { CurrentUser } from '@/modules/auth/current-user.decorator';
import { MappedUser } from '@/utils/user';
import { IServerBan } from '@/di/interfaces/IServerBanRepository';
import { IUser } from '@/models/User';
import { Bot } from '@/models/Bot';
import { Role } from '@/models/Server';
import { ErrorMessages } from '@/constants/errorMessages';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { NoBot } from '@/modules/auth/bot.decorator';
import {
    KickMemberRequestDTO,
    BanMemberRequestDTO,
    TransferOwnershipRequestDTO,
    TimeoutMemberRequestDTO,
} from './dto/server-member.request.dto';
import {
    ChannelPreferencesRequestDTO,
    SelfRolesRequestDTO,
} from './dto/server.request.dto';
import { getDocumentId, getDocumentIdString } from '@/utils/mongooseId';

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
        @Inject(TYPES.PingService)
        private pingService: PingService,
        @Inject(TYPES.ChannelRepository)
        private channelRepo?: IChannelRepository,
        @Inject(TYPES.CategoryRepository)
        private categoryRepo?: ICategoryRepository,
    ) {}

    private async requireMember(
        serverOid: Types.ObjectId,
        userOid: Types.ObjectId,
    ): Promise<IServerMember> {
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            userOid,
        );
        if (member === null) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }
        return member;
    }

    private getOnboardingConfig(
        server: Awaited<ReturnType<IServerRepository['findById']>>,
    ): {
        enabled: boolean;
        guidelines: string[];
        selfAssignableRoleIds: string[];
        landingChannelId?: string | null;
        welcomeChannelIds: string[];
    } {
        return {
            enabled: server?.onboarding?.enabled ?? false,
            guidelines: server?.onboarding?.guidelines ?? [],
            selfAssignableRoleIds:
                server?.onboarding?.selfAssignableRoleIds ?? [],
            landingChannelId: server?.onboarding?.landingChannelId ?? null,
            welcomeChannelIds: server?.onboarding?.welcomeChannelIds ?? [],
        };
    }

    private broadcastMemberUpdateToUser(
        serverId: string,
        userId: string,
        member: IServerMember,
    ): void {
        this.wsServer.broadcastToUser(userId, {
            type: 'member_updated',
            payload: {
                serverId,
                userId,
                member,
            },
        });
    }

    private broadcastPublicMemberUpdateToServer(
        serverId: string,
        userId: string,
        member: IServerMember,
    ): void {
        this.wsServer.broadcastToServer(serverId, {
            type: 'member_updated',
            payload: {
                serverId,
                userId,
                member: mapPublicServerMember(member),
            },
        });
    }

    @Get('onboarding')
    @NoBot()
    @ApiOperation({ summary: 'Get current member onboarding state' })
    @ApiResponse({
        status: 200,
        type: OnboardingStateResponseDTO,
        description: 'Onboarding state retrieved',
    })
    public async getOnboarding(
        @Param('serverId') serverId: string,
        @CurrentUser('id') userId: string,
    ): Promise<{
        onboarding: ReturnType<ServerMemberController['getOnboardingConfig']>;
        member: IServerMember;
    }> {
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        const member = await this.requireMember(serverOid, userOid);
        const server = await this.serverRepo.findById(serverOid);
        if (server === null) {
            throw new NotFoundException(ErrorMessages.SERVER.NOT_FOUND);
        }

        return {
            onboarding: this.getOnboardingConfig(server),
            member,
        };
    }

    @Post('onboarding/accept-rules')
    @NoBot()
    @ApiOperation({ summary: 'Accept server onboarding rules' })
    @ApiOkResponse({
        type: ServerMemberResponseDTO,
        description: 'Rules accepted',
    })
    public async acceptOnboardingRules(
        @Param('serverId') serverId: string,
        @CurrentUser('id') userId: string,
    ): Promise<IServerMember> {
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        await this.requireMember(serverOid, userOid);

        const member = await this.serverMemberRepo.update(serverOid, userOid, {
            rulesAcceptedAt: new Date(),
        });
        if (member === null) {
            throw new NotFoundException(ErrorMessages.MEMBER.NOT_FOUND);
        }
        this.broadcastMemberUpdateToUser(serverId, userId, member);
        return member;
    }

    @Patch('self-roles')
    @NoBot()
    @ApiOperation({ summary: 'Update current member self-assignable roles' })
    @ApiOkResponse({
        type: ServerMemberResponseDTO,
        description: 'Self roles updated',
    })
    public async updateSelfRoles(
        @Param('serverId') serverId: string,
        @CurrentUser('id') userId: string,
        @Body() body: SelfRolesRequestDTO,
    ): Promise<IServerMember> {
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        const member = await this.requireMember(serverOid, userOid);
        const server = await this.serverRepo.findById(serverOid);
        if (server === null) {
            throw new NotFoundException(ErrorMessages.SERVER.NOT_FOUND);
        }

        const config = this.getOnboardingConfig(server);
        const allowedIds = new Set(
            config.selfAssignableRoleIds.map((id) => id.toString()),
        );
        const requestedIds = new Set(body.roleIds);
        for (const roleId of requestedIds) {
            if (!allowedIds.has(roleId)) {
                throw new ForbiddenException(
                    'Role is not self-assignable in this server',
                );
            }
        }

        const roles = await this.roleRepo.findByServerId(serverOid);
        const roleMap = new Map(roles.map((r) => [getDocumentIdString(r), r]));
        for (const roleId of requestedIds) {
            const role = roleMap.get(roleId);
            if (
                role === undefined ||
                role.name.trim().toLowerCase() === '@everyone' ||
                role.managed === true
            ) {
                throw new ForbiddenException(
                    'Role is not self-assignable in this server',
                );
            }
        }

        const preservedRoleIds = member.roles
            .map((id) => id.toString())
            .filter((roleId) => !allowedIds.has(roleId));
        const nextRoleIds = [...new Set([...preservedRoleIds, ...requestedIds])]
            .filter((roleId) => roleMap.has(roleId))
            .map((roleId) => new Types.ObjectId(roleId));

        const updatedMember = await this.serverMemberRepo.updateRoles(
            serverOid,
            userOid,
            nextRoleIds,
        );
        if (updatedMember === null) {
            throw new NotFoundException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        this.permissionService.invalidateCache(serverOid);
        this.broadcastPublicMemberUpdateToServer(
            serverId,
            userId,
            updatedMember,
        );

        return updatedMember;
    }

    @Patch('channel-preferences')
    @NoBot()
    @ApiOperation({ summary: 'Update current member channel preferences' })
    @ApiOkResponse({
        type: ServerMemberResponseDTO,
        description: 'Channel preferences updated',
    })
    public async updateChannelPreferences(
        @Param('serverId') serverId: string,
        @CurrentUser('id') userId: string,
        @Body() body: ChannelPreferencesRequestDTO,
    ): Promise<IServerMember> {
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        await this.requireMember(serverOid, userOid);

        if (!this.channelRepo || !this.categoryRepo) {
            throw new Error('Required repositories are not initialized');
        }
        const channels = await this.channelRepo.findByServerId(serverOid);
        const categories = await this.categoryRepo.findByServerId(serverOid);
        const channelIds = new Set(channels.map((c) => getDocumentIdString(c)));
        const categoryIds = new Set(
            categories.map((c) => getDocumentIdString(c)),
        );
        const hiddenChannelIds = [...new Set(body.hiddenChannelIds)].map(
            (channelId) => {
                if (!channelIds.has(channelId)) {
                    throw new BadRequestException(
                        'Hidden channel is not in server',
                    );
                }
                return new Types.ObjectId(channelId);
            },
        );
        const hiddenCategoryIds = [...new Set(body.hiddenCategoryIds)].map(
            (categoryId) => {
                if (!categoryIds.has(categoryId)) {
                    throw new BadRequestException(
                        'Hidden category is not in server',
                    );
                }
                return new Types.ObjectId(categoryId);
            },
        );

        const member = await this.serverMemberRepo.update(serverOid, userOid, {
            hiddenChannelIds,
            hiddenCategoryIds,
        });
        if (member === null) {
            throw new NotFoundException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        this.broadcastMemberUpdateToUser(serverId, userId, member);
        return member;
    }

    @Post('onboarding/complete')
    @NoBot()
    @ApiOperation({ summary: 'Complete server onboarding' })
    @ApiOkResponse({
        type: ServerMemberResponseDTO,
        description: 'Onboarding completed',
    })
    public async completeOnboarding(
        @Param('serverId') serverId: string,
        @CurrentUser('id') userId: string,
    ): Promise<IServerMember> {
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        await this.requireMember(serverOid, userOid);

        const now = new Date();
        const member = await this.serverMemberRepo.update(serverOid, userOid, {
            onboardingRequired: false,
            onboardingCompletedAt: now,
        });
        if (member === null) {
            throw new NotFoundException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        this.broadcastMemberUpdateToUser(serverId, userId, member);
        return member;
    }

    @Get('members')
    @ApiOperation({ summary: 'Get all server members' })
    @ApiOkResponse({
        type: ServerMemberListResponseDTO,
        description: 'Server members retrieved',
    })
    @ApiResponse({ status: 403, description: ErrorMessages.SERVER.NOT_MEMBER })
    public async getServerMembers(
        @Param('serverId') serverId: string,
        @CurrentUser('id') userId: string,
    ): Promise<
        (IServerMember & { user: MappedUser | null; online: boolean })[]
    > {
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
    @ApiOkResponse({
        type: ServerMemberSearchResponseDTO,
        description: 'Search results',
    })
    @ApiResponse({ status: 403, description: ErrorMessages.SERVER.NOT_MEMBER })
    public async searchMembers(
        @Param('serverId') serverId: string,
        @Query('q') q: string,
        @CurrentUser('id') userId: string,
    ): Promise<
        (IServerMember & { user: MappedUser | null; online: boolean })[]
    > {
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
    @ApiOkResponse({
        type: ServerMemberWithUserResponseDTO,
        description: 'Member details retrieved',
    })
    @ApiResponse({ status: 403, description: ErrorMessages.SERVER.NOT_MEMBER })
    @ApiResponse({ status: 404, description: ErrorMessages.MEMBER.NOT_FOUND })
    public async getMember(
        @Param('serverId') serverId: string,
        @Param('userId') userId: string,
        @CurrentUser('id') currentUserId: string,
    ): Promise<IServerMember & { user: MappedUser | null }> {
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
    @ApiOkResponse({
        type: MemberActionResponseDTO,
        description: 'Left server',
    })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.SERVER.OWNER_CANNOT_LEAVE,
    })
    public async leaveServer(
        @Param('serverId') serverId: string,
        @CurrentUser('id') userId: string,
    ): Promise<{ message: string }> {
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        const server = await this.serverRepo.findById(serverOid);
        if (server && String(server.ownerId) === userId) {
            throw new ForbiddenException(
                ErrorMessages.SERVER.OWNER_CANNOT_LEAVE,
            );
        }

        await this.serverMemberRepo.remove(serverOid, userOid);
        await this.cleanupManagedRole(serverOid, userOid);
        this.permissionService.invalidateCache(serverOid);

        try {
            await this.pingService.clearServerPings(userOid, serverOid);
        } catch (err) {
            this.logger.error('Failed to clear pings after leave:', err);
        }

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
    @ApiOkResponse({
        type: MemberActionResponseDTO,
        description: 'Member kicked',
    })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.MEMBER.NO_PERMISSION_KICK,
    })
    @ApiResponse({ status: 404, description: ErrorMessages.MEMBER.NOT_FOUND })
    public async kickMember(
        @Param('serverId') serverId: string,
        @Param('userId') userId: string,
        @CurrentUser('id') currentUserId: string,
        @Body() _body: KickMemberRequestDTO,
    ): Promise<{ message: string }> {
        const serverOid = new Types.ObjectId(serverId);
        const currentOid = new Types.ObjectId(currentUserId);
        const targetOid = new Types.ObjectId(userId);
        await this.permissionService.requirePermission(
            serverOid,
            currentOid,
            'kickMembers',
            new ForbiddenException(ErrorMessages.MEMBER.NO_PERMISSION_KICK),
        );

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            targetOid,
        );
        if (member === null) {
            throw new NotFoundException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        const server = await this.serverRepo.findById(serverOid);
        if (server && String(server.ownerId) === userId) {
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

        try {
            await this.pingService.clearServerPings(targetOid, serverOid);
        } catch (err) {
            this.logger.error('Failed to clear pings after kick:', err);
        }

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
    @ApiOkResponse({
        type: MemberActionResponseDTO,
        description: 'Member banned',
    })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.MEMBER.NO_PERMISSION_BAN,
    })
    public async banMember(
        @Param('serverId') serverId: string,
        @CurrentUser('id') currentUserId: string,
        @Body() body: BanMemberRequestDTO,
    ): Promise<{ message: string }> {
        const serverOid = new Types.ObjectId(serverId);
        const currentOid = new Types.ObjectId(currentUserId);
        const { userId, reason } = body;
        const targetOid = new Types.ObjectId(userId);

        await this.permissionService.requirePermission(
            serverOid,
            currentOid,
            'banMembers',
            new ForbiddenException(ErrorMessages.MEMBER.NO_PERMISSION_BAN),
        );

        const server = await this.serverRepo.findById(serverOid);
        if (server && String(server.ownerId) === userId) {
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
            reason:
                reason !== undefined && reason !== ''
                    ? reason
                    : 'No reason provided',
            bannedBy: currentOid,
        });

        await this.serverMemberRepo.remove(serverOid, targetOid);
        await this.cleanupManagedRole(serverOid, targetOid);
        this.permissionService.invalidateCache(serverOid);

        try {
            await this.pingService.clearServerPings(targetOid, serverOid);
        } catch (err) {
            this.logger.error('Failed to clear pings after ban:', err);
        }

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
    @ApiOkResponse({
        type: TimeoutResponseDTO,
        description: 'Member timed out',
    })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
    })
    public async timeoutMember(
        @Param('serverId') serverId: string,
        @Param('userId') userId: string,
        @CurrentUser('id') currentUserId: string,
        @Body() body: TimeoutMemberRequestDTO,
    ): Promise<{ message: string; communicationDisabledUntil: string | null }> {
        const serverOid = new Types.ObjectId(serverId);
        const currentOid = new Types.ObjectId(currentUserId);
        const targetOid = new Types.ObjectId(userId);
        const { duration, reason } = body;

        await this.permissionService.requirePermission(
            serverOid,
            currentOid,
            'moderateMembers',
            new ForbiddenException(
                'You do not have permission to timeout members',
            ),
        );

        const server = await this.serverRepo.findById(serverOid);
        if (server !== null && String(server.ownerId) === userId) {
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

        const until =
            duration !== undefined && duration > 0
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

        this.broadcastPublicMemberUpdateToServer(
            serverId,
            userId,
            updatedMember,
        );

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverOid,
            actorId: currentOid,
            actionType: until ? 'user_timeout' : 'user_timeout_remove',
            targetId: targetOid,
            targetType: 'user',
            targetUserId: targetOid,
            reason:
                reason !== undefined && reason !== ''
                    ? reason
                    : 'No reason provided',
            metadata: {
                durationSeconds: duration,
                until: until ? until.toISOString() : undefined,
            },
        });

        return {
            message: until ? 'Member timed out' : 'Timeout removed',
            communicationDisabledUntil: until ? until.toISOString() : null,
        };
    }

    @Delete('bans/:userId')
    @ApiOperation({ summary: 'Unban a user from the server' })
    @ApiOkResponse({
        type: MemberActionResponseDTO,
        description: 'Member unbanned',
    })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.MEMBER.NO_PERMISSION_UNBAN,
    })
    public async unbanMember(
        @Param('serverId') serverId: string,
        @Param('userId') userId: string,
        @CurrentUser('id') currentUserId: string,
    ): Promise<{ message: string }> {
        const serverOid = new Types.ObjectId(serverId);
        const currentOid = new Types.ObjectId(currentUserId);
        const targetOid = new Types.ObjectId(userId);
        await this.permissionService.requirePermission(
            serverOid,
            currentOid,
            'banMembers',
            new ForbiddenException(ErrorMessages.MEMBER.NO_PERMISSION_UNBAN),
        );

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
    @ApiOkResponse({
        type: [ServerBanResponseDTO],
        description: 'Server bans retrieved',
    })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.MEMBER.NO_PERMISSION_VIEW_BANS,
    })
    public async getBans(
        @Param('serverId') serverId: string,
        @CurrentUser('id') currentUserId: string,
    ): Promise<IServerBan[]> {
        const serverOid = new Types.ObjectId(serverId);
        const currentOid = new Types.ObjectId(currentUserId);
        await this.permissionService.requirePermission(
            serverOid,
            currentOid,
            'banMembers',
            new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_VIEW_BANS,
            ),
        );

        return await this.serverBanRepo.findByServerIdWithUserInfo(serverOid);
    }

    @Post('members/:userId/roles/:roleId')
    @ApiOperation({ summary: 'Add a role to a member' })
    @ApiOkResponse({ type: ServerMemberResponseDTO, description: 'Role added' })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
    })
    @ApiResponse({ status: 404, description: ErrorMessages.MEMBER.NOT_FOUND })
    public async addMemberRole(
        @Param('serverId') serverId: string,
        @Param('userId') userId: string,
        @Param('roleId') roleId: string,
        @CurrentUser('id') currentUserId: string,
    ): Promise<IServerMember> {
        const serverOid = new Types.ObjectId(serverId);
        const currentOid = new Types.ObjectId(currentUserId);
        const targetOid = new Types.ObjectId(userId);
        const roleOid = new Types.ObjectId(roleId);
        await this.permissionService.requirePermission(
            serverOid,
            currentOid,
            'manageRoles',
            new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
            ),
        );

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
        const isOwner =
            server !== null && String(server.ownerId) === currentUserId;

        if (isOwner !== true) {
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
                    'You cannot manage roles for a member with a role equal to or higher than your own',
                );
            }

            if (currentUserHighest <= role.position) {
                throw new ForbiddenException(
                    'You cannot assign a role equal to or higher than your own highest role',
                );
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

        this.broadcastPublicMemberUpdateToServer(
            serverId,
            userId,
            updatedMember,
        );

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
    @ApiOkResponse({
        type: ServerMemberResponseDTO,
        description: 'Role removed',
    })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
    })
    @ApiResponse({ status: 404, description: ErrorMessages.MEMBER.NOT_FOUND })
    public async removeMemberRole(
        @Param('serverId') serverId: string,
        @Param('userId') userId: string,
        @Param('roleId') roleId: string,
        @CurrentUser('id') currentUserId: string,
    ): Promise<IServerMember> {
        const serverOid = new Types.ObjectId(serverId);
        const currentOid = new Types.ObjectId(currentUserId);
        const targetOid = new Types.ObjectId(userId);
        const roleOid = new Types.ObjectId(roleId);
        await this.permissionService.requirePermission(
            serverOid,
            currentOid,
            'manageRoles',
            new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
            ),
        );

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
        if (role.name === '@everyone') {
            throw new BadRequestException(
                ErrorMessages.ROLE.CANNOT_REMOVE_EVERYONE,
            );
        }
        if (role.managed === true) {
            throw new ForbiddenException(
                'Cannot remove a managed role from a member',
            );
        }

        const server = await this.serverRepo.findById(serverOid);
        const isOwner =
            server !== null && String(server.ownerId) === currentUserId;

        if (isOwner !== true) {
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
                    'You cannot manage roles for a member with a role equal to or higher than your own',
                );
            }

            if (currentUserHighest <= role.position) {
                throw new ForbiddenException(
                    'You cannot remove a role equal to or higher than your own highest role',
                );
            }
        }

        const updatedMember = await this.serverMemberRepo.removeRole(
            serverOid,
            targetOid,
            roleOid,
        );

        this.permissionService.invalidateCache(serverOid);

        this.broadcastPublicMemberUpdateToServer(
            serverId,
            userId,
            updatedMember,
        );

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
    @ApiOkResponse({
        type: TransferOwnershipResponseDTO,
        description: 'Ownership transferred',
    })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.SERVER.TRANSFER_OWNERSHIP_ONLY_OWNER,
    })
    @ApiResponse({ status: 404, description: ErrorMessages.MEMBER.NOT_FOUND })
    public async transferOwnership(
        @Param('serverId') serverId: string,
        @CurrentUser('id') userId: string,
        @Body() body: TransferOwnershipRequestDTO,
    ): Promise<{ message: string }> {
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        const { newOwnerId } = body;
        const newOwnerOid = new Types.ObjectId(newOwnerId);

        const server = await this.serverRepo.findById(serverOid);
        if (!server) {
            throw new NotFoundException('Server not found');
        }

        if (String(server.ownerId) !== userId) {
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

        await this.serverRepo.update(serverOid, { ownerId: newOwnerId });

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

    private async cleanupManagedRole(
        serverId: Types.ObjectId,
        userId: Types.ObjectId,
    ) {
        try {
            const bot = await Bot.findOne({ userId }).lean();
            if (bot) {
                const managedRole = await Role.findOne({
                    serverId,
                    managed: true,
                    managedBotId: getDocumentId(bot) as Types.ObjectId,
                }).lean();

                if (managedRole) {
                    await this.roleRepo.delete(
                        getDocumentId(managedRole) as Types.ObjectId,
                    );
                    this.wsServer.broadcastToServer(serverId.toString(), {
                        type: 'role_deleted',
                        payload: {
                            serverId: serverId.toString(),
                            roleId: getDocumentIdString(managedRole),
                        },
                    });
                }
            }
        } catch (err) {
            this.logger.error('Failed to cleanup managed role', err);
        }
    }
}
