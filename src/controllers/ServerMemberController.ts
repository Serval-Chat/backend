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
    InternalServerErrorException,
} from '@nestjs/common';
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
    ServerMemberWithPresenceResponseDTO,
    OnboardingStateResponseDTO,
    ServerMemberAdminListResponseDTO,
    ServerMemberAdminEntryDTO,
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
import type { IMessageRepository } from '@/di/interfaces/IMessageRepository';
import { PermissionService } from '@/permissions/PermissionService';
import type { ILogger } from '@/di/interfaces/ILogger';
import type { IServerAuditLogService } from '@/di/interfaces/IServerAuditLogService';
import type { IBlockRepository } from '@/di/interfaces/IBlockRepository';
import { BlockFlags } from '@/privacy/blockFlags';
import { PingService } from '@/services/PingService';

import { mapUser, type MappedUser } from '@/utils/user';
import {
    mapPublicServerMember,
    mapServerMemberToDTO,
    mapServerMemberWithUserToDTO,
    type ServerMemberDTOShape,
    type ServerMemberWithUserDTOShape,
} from '@/utils/serverMember';
import { CurrentUser } from '@/modules/auth/current-user.decorator';
import { IUser } from '@/models/User';
import { Bot } from '@/models/Bot';
import { Role } from '@/models/Server';
import { ErrorMessages } from '@/constants/errorMessages';
import { AuthGuard } from '@/modules/auth/auth.module';
import { NoBot } from '@/modules/auth/bot.decorator';
import {
    KickMemberRequestDTO,
    BanMemberRequestDTO,
    TransferOwnershipRequestDTO,
    TimeoutMemberRequestDTO,
    ServerMemberAdminQueryDTO,
    banDurationToHours,
} from './dto/server-member.request.dto';
import {
    ChannelPreferencesRequestDTO,
    SelfRolesRequestDTO,
} from './dto/server.request.dto';

@Controller('api/v1/servers/:serverId')
@ApiTags('Server Members')
@ApiBearerAuth()
@UseGuards(AuthGuard)
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
        @Inject(TYPES.MessageRepository)
        private messageRepo?: IMessageRepository,
    ) {}

    private async requireMember(
        serverOid: string,
        userId: string,
    ): Promise<IServerMember> {
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            userId,
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
        member: ServerMemberDTOShape;
    }> {
        const member = await this.requireMember(serverId, userId);
        const server = await this.serverRepo.findById(serverId);
        if (server === null) {
            throw new NotFoundException(ErrorMessages.SERVER.NOT_FOUND);
        }

        return {
            onboarding: this.getOnboardingConfig(server),
            member: mapServerMemberToDTO(member),
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
    ): Promise<ServerMemberDTOShape> {
        await this.requireMember(serverId, userId);

        const member = await this.serverMemberRepo.update(serverId, userId, {
            rulesAcceptedAt: new Date(),
        });
        if (member === null) {
            throw new NotFoundException(ErrorMessages.MEMBER.NOT_FOUND);
        }
        this.broadcastMemberUpdateToUser(serverId, userId, member);
        return mapServerMemberToDTO(member);
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
    ): Promise<ServerMemberDTOShape> {
        const member = await this.requireMember(serverId, userId);
        const server = await this.serverRepo.findById(serverId);
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

        const roles = await this.roleRepo.findByServerId(serverId);
        const roleMap = new Map(roles.map((r) => [r.snowflakeId, r]));
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

        const preservedRoleIds = member.roles.filter(
            (roleId) => !allowedIds.has(roleId),
        );
        const nextRoleIds = [
            ...new Set([...preservedRoleIds, ...requestedIds]),
        ].filter((roleId) => roleMap.has(roleId));

        const updatedMember = await this.serverMemberRepo.updateRoles(
            serverId,
            userId,
            nextRoleIds,
        );
        if (updatedMember === null) {
            throw new NotFoundException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        this.permissionService.invalidateCache(serverId);
        this.broadcastPublicMemberUpdateToServer(
            serverId,
            userId,
            updatedMember,
        );

        return mapServerMemberToDTO(updatedMember);
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
    ): Promise<ServerMemberDTOShape> {
        await this.requireMember(serverId, userId);

        if (!this.channelRepo || !this.categoryRepo) {
            throw new InternalServerErrorException(
                'Required repositories are not initialized',
            );
        }
        const channels = await this.channelRepo.findByServerId(serverId);
        const categories = await this.categoryRepo.findByServerId(serverId);
        const channelIds = new Set(channels.map((c) => c.snowflakeId));
        const categoryIds = new Set(categories.map((c) => c.snowflakeId));
        const hiddenChannelIds = [...new Set(body.hiddenChannelIds)].map(
            (channelId) => {
                if (!channelIds.has(channelId)) {
                    throw new BadRequestException(
                        'Hidden channel is not in server',
                    );
                }
                return channelId;
            },
        );
        const hiddenCategoryIds = [...new Set(body.hiddenCategoryIds)].map(
            (categoryId) => {
                if (!categoryIds.has(categoryId)) {
                    throw new BadRequestException(
                        'Hidden category is not in server',
                    );
                }
                return categoryId;
            },
        );

        const member = await this.serverMemberRepo.update(serverId, userId, {
            hiddenChannelIds,
            hiddenCategoryIds,
        });
        if (member === null) {
            throw new NotFoundException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        this.broadcastMemberUpdateToUser(serverId, userId, member);
        return mapServerMemberToDTO(member);
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
    ): Promise<ServerMemberDTOShape> {
        await this.requireMember(serverId, userId);

        const now = new Date();
        const member = await this.serverMemberRepo.update(serverId, userId, {
            onboardingRequired: false,
            onboardingCompletedAt: now,
        });
        if (member === null) {
            throw new NotFoundException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        this.broadcastMemberUpdateToUser(serverId, userId, member);
        return mapServerMemberToDTO(member);
    }

    @Get('members')
    @ApiOperation({ summary: 'Get all server members' })
    @ApiOkResponse({
        type: [ServerMemberWithPresenceResponseDTO],
        description: 'Server members retrieved',
    })
    @ApiResponse({ status: 403, description: ErrorMessages.SERVER.NOT_MEMBER })
    public async getServerMembers(
        @Param('serverId') serverId: string,
        @CurrentUser('id') userId: string,
    ): Promise<(ServerMemberWithUserDTOShape & { online: boolean })[]> {
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (member === null) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const members =
            await this.serverMemberRepo.findByServerIdWithUserInfo(serverId);

        return this.filterAndEnrichMembers(members, userId);
    }

    @Get('members/search')
    @ApiOperation({ summary: 'Search server members' })
    @ApiOkResponse({
        type: [ServerMemberWithPresenceResponseDTO],
        description: 'Search results',
    })
    @ApiResponse({ status: 403, description: ErrorMessages.SERVER.NOT_MEMBER })
    public async searchMembers(
        @Param('serverId') serverId: string,
        @Query('q') q: string,
        @CurrentUser('id') userId: string,
    ): Promise<(ServerMemberWithUserDTOShape & { online: boolean })[]> {
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (member === null) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const members = await this.serverMemberRepo.searchMembers(serverId, q);

        return this.filterAndEnrichMembers(members, userId);
    }

    private async filterAndEnrichMembers(
        members: (IServerMember & { user: MappedUser | null })[],
        currentUserId: string,
    ): Promise<(ServerMemberWithUserDTOShape & { online: boolean })[]> {
        const [blocksByA, blocksAgainstA] = await Promise.all([
            this.blockRepo.findBlocksByBlocker(currentUserId),
            this.blockRepo.findBlocksByTarget(currentUserId),
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

                const isInvisible = m.user?.presenceStatus === 'offline';

                return {
                    ...mapServerMemberWithUserToDTO(m, m.user),
                    online:
                        shouldHidePresence || isInvisible
                            ? false
                            : await this.wsServer.isUserOnline(targetUserIdStr),
                };
            }),
        );
    }

    @Get('members/admin')
    @ApiOperation({ summary: 'Get server members (admin/moderation view)' })
    @ApiOkResponse({
        type: ServerMemberAdminListResponseDTO,
        description: 'Filtered member list retrieved',
    })
    @ApiResponse({ status: 403, description: ErrorMessages.SERVER.NOT_MEMBER })
    public async getServerMembersAdmin(
        @Param('serverId') serverId: string,
        @Query() query: ServerMemberAdminQueryDTO,
        @CurrentUser('id') userId: string,
    ): Promise<ServerMemberAdminListResponseDTO> {
        await this.requireMember(serverId, userId);

        await this.permissionService.requireAnyPermission(
            serverId,
            userId,
            ['banMembers', 'kickMembers', 'moderateMembers'],
            new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_VIEW_MEMBERS,
            ),
        );

        const limit = query.limit ?? 50;
        const offset = query.offset ?? 0;

        const { members, total } =
            await this.serverMemberRepo.findByServerIdFiltered(serverId, {
                roleId: query.roleId,
                search: query.search,
                sortBy: query.sortBy ?? 'joinedAt',
                sortDir: query.sortDir ?? 'desc',
                limit,
                offset,
            });

        const mappedMembers: ServerMemberAdminEntryDTO[] = members.map((m) => ({
            ...mapServerMemberWithUserToDTO(m, m.user),
            joinedVia: m.joinedVia,
        }));

        return { members: mappedMembers, total, limit, offset };
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
    ): Promise<ServerMemberWithUserDTOShape> {
        const currentMember = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            currentUserId,
        );
        if (currentMember === null) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (member === null) {
            throw new NotFoundException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        const user = await this.userRepo.findById(userId);
        return mapServerMemberWithUserToDTO(
            member,
            user ? mapUser(user as IUser) : null,
        );
    }

    private async teardownServerSubscriptions(
        serverId: string,
        userId: string,
    ): Promise<void> {
        try {
            const channels =
                (await this.channelRepo?.findByServerId(serverId)) ?? [];
            const channelIds = channels.map((channel) => channel.snowflakeId);
            this.wsServer.unsubscribeUserFromServer(
                userId,
                serverId,
                channelIds,
            );
        } catch (err) {
            this.logger.error('Failed to tear down server subscriptions:', err);
        }
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
    ): Promise<MemberActionResponseDTO> {
        const server = await this.serverRepo.findById(serverId);
        if (server && String(server.ownerId) === userId) {
            throw new ForbiddenException(
                ErrorMessages.SERVER.OWNER_CANNOT_LEAVE,
            );
        }

        await this.serverMemberRepo.remove(serverId, userId);
        await this.cleanupManagedRole(serverId, userId);
        this.permissionService.invalidateCache(serverId);

        try {
            await this.pingService.clearServerPings(userId, serverId);
        } catch (err) {
            this.logger.error('Failed to clear pings after leave:', err);
        }

        this.wsServer.broadcastToServer(serverId, {
            type: 'member_removed',
            payload: { serverId, userId },
        });

        await this.teardownServerSubscriptions(serverId, userId);

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverId,
            actorId: userId,
            actionType: 'user_leave',
            targetId: userId,
            targetType: 'user',
            targetUserId: userId,
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
    ): Promise<MemberActionResponseDTO> {
        await this.permissionService.requirePermission(
            serverId,
            currentUserId,
            'kickMembers',
            new ForbiddenException(ErrorMessages.MEMBER.NO_PERMISSION_KICK),
        );

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (member === null) {
            throw new NotFoundException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        const server = await this.serverRepo.findById(serverId);
        if (server && String(server.ownerId) === userId) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.CANNOT_KICK_OWNER,
            );
        }

        const currentUserHighest =
            await this.permissionService.getHighestRolePosition(
                serverId,
                currentUserId,
            );
        const targetHighest =
            await this.permissionService.getHighestRolePosition(
                serverId,
                userId,
            );

        if (currentUserHighest <= targetHighest) {
            throw new ForbiddenException(
                'You cannot kick a member with a role equal to or higher than your own',
            );
        }

        await this.serverMemberRepo.remove(serverId, userId);
        await this.cleanupManagedRole(serverId, userId);
        this.permissionService.invalidateCache(serverId);

        try {
            await this.pingService.clearServerPings(userId, serverId);
        } catch (err) {
            this.logger.error('Failed to clear pings after kick:', err);
        }

        this.wsServer.broadcastToServer(serverId, {
            type: 'member_removed',
            payload: { serverId, userId },
        });

        await this.teardownServerSubscriptions(serverId, userId);

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverId,
            actorId: currentUserId,
            actionType: 'user_kick',
            targetId: userId,
            targetType: 'user',
            targetUserId: userId,
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
    ): Promise<MemberActionResponseDTO> {
        const { userId, reason, deleteMessageDuration } = body;

        await this.permissionService.requirePermission(
            serverId,
            currentUserId,
            'banMembers',
            new ForbiddenException(ErrorMessages.MEMBER.NO_PERMISSION_BAN),
        );

        const server = await this.serverRepo.findById(serverId);
        if (server && String(server.ownerId) === userId) {
            throw new ForbiddenException(ErrorMessages.MEMBER.CANNOT_BAN_OWNER);
        }

        const currentUserHighest =
            await this.permissionService.getHighestRolePosition(
                serverId,
                currentUserId,
            );
        const targetHighest =
            await this.permissionService.getHighestRolePosition(
                serverId,
                userId,
            );

        if (currentUserHighest <= targetHighest) {
            throw new ForbiddenException(
                'You cannot ban a member with a role equal to or higher than your own',
            );
        }

        await this.serverBanRepo.create({
            serverId: serverId,
            userId: userId,
            reason:
                reason !== undefined && reason !== ''
                    ? reason
                    : 'No reason provided',
            bannedBy: currentUserId,
        });

        await this.serverMemberRepo.remove(serverId, userId);
        await this.cleanupManagedRole(serverId, userId);
        this.permissionService.invalidateCache(serverId);

        try {
            await this.pingService.clearServerPings(userId, serverId);
        } catch (err) {
            this.logger.error('Failed to clear pings after ban:', err);
        }

        if (deleteMessageDuration !== undefined && this.messageRepo) {
            try {
                const hours = banDurationToHours(deleteMessageDuration);
                const after =
                    hours !== null
                        ? new Date(Date.now() - hours * 60 * 60 * 1000)
                        : new Date(0);

                const deletedCount =
                    await this.messageRepo.softDeleteByAuthorAfter(
                        serverId,
                        userId,
                        after,
                    );

                if (deletedCount > 0) {
                    this.wsServer.broadcastToServer(serverId, {
                        type: 'messages_server_bulk_deleted_by_author',
                        payload: {
                            senderId: userId,
                            serverId,
                            after: after.toISOString(),
                        },
                    });
                }
            } catch (err) {
                this.logger.error('Failed to delete messages after ban:', err);
            }
        }

        this.wsServer.broadcastToServer(serverId, {
            type: 'member_removed',
            payload: { serverId, userId },
        });
        this.wsServer.broadcastToServer(serverId, {
            type: 'member_banned',
            payload: { serverId, userId },
        });

        await this.teardownServerSubscriptions(serverId, userId);

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverId,
            actorId: currentUserId,
            actionType: 'user_ban',
            targetId: userId,
            targetType: 'user',
            targetUserId: userId,
            reason: reason,
            metadata: {
                deleteMessageDuration,
            },
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
    ): Promise<TimeoutResponseDTO> {
        const { duration, reason } = body;

        await this.permissionService.requirePermission(
            serverId,
            currentUserId,
            'moderateMembers',
            new ForbiddenException(
                'You do not have permission to timeout members',
            ),
        );

        const server = await this.serverRepo.findById(serverId);
        if (server !== null && String(server.ownerId) === userId) {
            throw new ForbiddenException('You cannot timeout the server owner');
        }

        const currentUserHighest =
            await this.permissionService.getHighestRolePosition(
                serverId,
                currentUserId,
            );
        const targetHighest =
            await this.permissionService.getHighestRolePosition(
                serverId,
                userId,
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
            serverId,
            userId,
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
            serverId: serverId,
            actorId: currentUserId,
            actionType: until ? 'user_timeout' : 'user_timeout_remove',
            targetId: userId,
            targetType: 'user',
            targetUserId: userId,
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
    ): Promise<MemberActionResponseDTO> {
        await this.permissionService.requirePermission(
            serverId,
            currentUserId,
            'banMembers',
            new ForbiddenException(ErrorMessages.MEMBER.NO_PERMISSION_UNBAN),
        );

        await this.serverBanRepo.unban(serverId, userId);

        this.wsServer.broadcastToServer(serverId, {
            type: 'member_unbanned',
            payload: { serverId, userId },
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverId,
            actorId: currentUserId,
            actionType: 'user_unban',
            targetId: userId,
            targetType: 'user',
            targetUserId: userId,
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
    ): Promise<ServerBanResponseDTO[]> {
        await this.permissionService.requirePermission(
            serverId,
            currentUserId,
            'banMembers',
            new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_VIEW_BANS,
            ),
        );

        const bans =
            await this.serverBanRepo.findByServerIdWithUserInfo(serverId);
        return bans.map((ban) => ({
            userId: ban.userId,
            username: ban.user?.username,
            reason: ban.reason,
            bannedAt: ban.createdAt.toISOString(),
        }));
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
    ): Promise<ServerMemberDTOShape> {
        await this.permissionService.requirePermission(
            serverId,
            currentUserId,
            'manageRoles',
            new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
            ),
        );

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (member === null) {
            throw new NotFoundException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        const role = await this.roleRepo.findById(roleId);
        if (role === null || role.serverId !== serverId) {
            throw new NotFoundException(ErrorMessages.ROLE.NOT_FOUND);
        }
        if (role.name.trim().toLowerCase() === '@everyone') {
            throw new BadRequestException(
                ErrorMessages.ROLE.CANNOT_ADD_EVERYONE,
            );
        }
        if (role.managed === true) {
            throw new ForbiddenException(
                ErrorMessages.ROLE.CANNOT_ASSIGN_MANAGED,
            );
        }

        const server = await this.serverRepo.findById(serverId);
        const isOwner =
            server !== null && String(server.ownerId) === currentUserId;

        if (isOwner !== true) {
            const currentUserHighest =
                await this.permissionService.getHighestRolePosition(
                    serverId,
                    currentUserId,
                );
            const targetHighest =
                await this.permissionService.getHighestRolePosition(
                    serverId,
                    userId,
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

        if (member.roles.some((r) => r === roleId)) {
            return mapServerMemberToDTO(member);
        }

        const updatedMember = await this.serverMemberRepo.addRole(
            serverId,
            userId,
            roleId,
        );

        this.permissionService.invalidateCache(serverId);

        this.broadcastPublicMemberUpdateToServer(
            serverId,
            userId,
            updatedMember,
        );

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverId,
            actorId: currentUserId,
            actionType: 'role_given',
            targetId: roleId,
            targetType: 'role',
            targetUserId: userId,
            metadata: { roleName: role.name },
        });

        return mapServerMemberToDTO(updatedMember);
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
    ): Promise<ServerMemberDTOShape> {
        await this.permissionService.requirePermission(
            serverId,
            currentUserId,
            'manageRoles',
            new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
            ),
        );

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (member === null) {
            throw new NotFoundException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        const role = await this.roleRepo.findById(roleId);
        if (role === null || role.serverId !== serverId) {
            throw new NotFoundException(ErrorMessages.ROLE.NOT_FOUND);
        }
        if (role.name.trim().toLowerCase() === '@everyone') {
            throw new BadRequestException(
                ErrorMessages.ROLE.CANNOT_REMOVE_EVERYONE,
            );
        }
        if (role.managed === true) {
            throw new ForbiddenException(
                'Cannot remove a managed role from a member',
            );
        }

        const server = await this.serverRepo.findById(serverId);
        const isOwner =
            server !== null && String(server.ownerId) === currentUserId;

        if (isOwner !== true) {
            const currentUserHighest =
                await this.permissionService.getHighestRolePosition(
                    serverId,
                    currentUserId,
                );
            const targetHighest =
                await this.permissionService.getHighestRolePosition(
                    serverId,
                    userId,
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
            serverId,
            userId,
            roleId,
        );

        this.permissionService.invalidateCache(serverId);

        this.broadcastPublicMemberUpdateToServer(
            serverId,
            userId,
            updatedMember,
        );

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverId,
            actorId: currentUserId,
            actionType: 'role_removed',
            targetId: roleId,
            targetType: 'role',
            targetUserId: userId,
            metadata: { roleName: role.name },
        });

        return mapServerMemberToDTO(updatedMember);
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
    ): Promise<TransferOwnershipResponseDTO> {
        const { newOwnerId } = body;

        const server = await this.serverRepo.findById(serverId);
        if (!server) {
            throw new NotFoundException('Server not found');
        }

        if (String(server.ownerId) !== userId) {
            throw new ForbiddenException(
                ErrorMessages.SERVER.TRANSFER_OWNERSHIP_ONLY_OWNER,
            );
        }

        const newOwnerMember = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            newOwnerId,
        );
        if (!newOwnerMember) {
            throw new NotFoundException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        await this.serverRepo.update(serverId, { ownerId: newOwnerId });

        this.permissionService.invalidateCache(serverId);

        this.wsServer.broadcastToServer(serverId, {
            type: 'ownership_transferred',
            payload: {
                serverId,
                oldOwnerId: userId,
                newOwnerId: newOwnerId,
            },
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverId,
            actorId: userId,
            actionType: 'owner_changed',
            targetId: serverId,
            targetType: 'server',
            targetUserId: newOwnerId,
        });

        return { message: 'Ownership transferred' };
    }

    private async cleanupManagedRole(serverId: string, userId: string) {
        try {
            const bot = await Bot.findOne({ userId }).lean();
            if (bot) {
                const managedRole = await Role.findOne({
                    serverId,
                    managed: true,
                    managedBotId: bot.snowflakeId,
                }).lean();

                if (managedRole) {
                    await this.roleRepo.delete(managedRole.snowflakeId);
                    this.wsServer.broadcastToServer(serverId, {
                        type: 'role_deleted',
                        payload: {
                            serverId,
                            roleId: managedRole.snowflakeId,
                        },
                    });
                }
            }
        } catch (err) {
            this.logger.error('Failed to cleanup managed role', err);
        }
    }
}
