import {
    Controller,
    Get,
    Post,
    Delete,
    Put,
    Body,
    Param as Path,
    UseGuards,
    Query,
    Req as Request,
    Inject,
    HttpCode,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import {
    ApiTags,
    ApiResponse,
    ApiOkResponse,
    ApiOperation,
    ApiBearerAuth,
} from '@nestjs/swagger';
import { TYPES } from '@/di/types';
import { toApiId } from '@/utils/mongooseId';
import { isValidSnowflakeId } from '@/utils/snowflake';
import type { IUser, IUserRepository } from '@/di/interfaces/IUserRepository';
import type {
    IAuditLogRepository,
    IAuditLog,
} from '@/di/interfaces/IAuditLogRepository';
import type { IFriendshipRepository } from '@/di/interfaces/IFriendshipRepository';
import type { IBanRepository, IBan } from '@/di/interfaces/IBanRepository';
import type { IMuteRepository, IMute } from '@/di/interfaces/IMuteRepository';
import type {
    IServerRepository,
    IServer,
} from '@/di/interfaces/IServerRepository';
import type { IMessageRepository } from '@/di/interfaces/IMessageRepository';
import type { IServerMessageRepository } from '@/di/interfaces/IServerMessageRepository';
import type { IWarningRepository } from '@/di/interfaces/IWarningRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IChannelRepository } from '@/di/interfaces/IChannelRepository';
import type { IInviteRepository } from '@/di/interfaces/IInviteRepository';
import type { IAdminNoteRepository } from '@/di/interfaces/IAdminNoteRepository';
import type { IWsServer } from '@/ws/interfaces/IWsServer';
import { ErrorMessages } from '@/constants/errorMessages';
import type { ILogger } from '@/di/interfaces/ILogger';
import crypto from 'crypto';
import type { IUserUpdatedEvent } from '@/ws/protocol/events/presence';
import type {
    IMemberRemovedEvent,
    IServerDeletedEvent,
    IWarningEvent,
} from '@/ws/protocol/events/server_notifications';
import { Badge } from '@/models/Badge';

type ApiUser = IUser & { id: string };
import { Ban } from '@/models/Ban';
import { ServerBan } from '@/models/Server';
import { UserConnection } from '@/models/UserConnection';
import { resolveSerializedCustomStatus } from '@/utils/status';
import { IAdminNote, IAdminNoteHistory } from '@/models/AdminNote';
import mongoose from 'mongoose';
import {
    generateAnonymizedUsername,
    DELETED_AVATAR_PATH,
    deleteAvatarFile,
} from '@/utils/deletion';
import { DashBoardStatsDTO } from './dto/admin-dashboard-stats.response.dto';
import {
    AdminSimpleMessageResponseDTO,
    AdminServerVerificationOverrideResponseDTO,
    AdminServerVerifyResponseDTO,
} from './dto/admin-servers-details.response.dto';
import { AdminPermissions, ProfileFieldDTO } from './dto/common.request.dto';
import {
    AdminUserListItemDTO,
    AdminExtendedUserDetailsDTO,
    AdminUserShortDTO,
} from './dto/admin-users.response.dto';
import {
    AdminResetProfileRequestDTO,
    AdminSoftDeleteUserRequestDTO,
    AdminUpdateUserPermissionsRequestDTO,
    AdminBanUserRequestDTO,
    AdminWarnUserRequestDTO,
    AdminMuteUserRequestDTO,
} from './dto/admin-user-actions.request.dto';
import {
    AdminResetProfileResponseDTO,
    AdminSoftDeleteUserResponseDTO,
    AdminDeleteUserResponseDTO,
    AdminHardDeleteUserResponseDTO,
    AdminUpdateUserPermissionsResponseDTO,
    AdminBanUserResponseDTO,
    AdminUnbanUserResponseDTO,
    AdminWarnUserResponseDTO,
    AdminMuteUserResponseDTO,
    AdminUnmuteUserResponseDTO,
} from './dto/admin-user-actions.response.dto';
import {
    AdminUserBanHistoryResponseDTO,
    AdminBanListResponseDTO,
    AdminBanListItemDTO,
    AdminBansDiagnosticResponseDTO,
} from './dto/admin-bans.response.dto';
import {
    AdminUserWarningsResponseDTO,
    AdminWarningListResponseDTO,
} from './dto/admin-warnings.response.dto';
import {
    AdminAuditLogListResponseDTO,
    AdminAuditLogListItemDTO,
    AdminAuditLogChangeDTO,
    AdminAuditLogJsonObject,
} from './dto/admin-audit-logs.response.dto';
import { AdminListAuditLogsRequestDTO } from './dto/admin-audit-logs.request.dto';
import { AdminBanSampleDTO, AdminBanHistoryItemDTO } from './dto/types.dto';
import {
    AdminServerListResponseDTO,
    AdminDeleteServerResponseDTO,
    AdminRestoreServerResponseDTO,
    AdminServerListItemDTO,
} from './dto/admin-servers.response.dto';
import {
    AdminServerVerificationOverrideRequestDTO,
    AdminServerVerificationStatsDTO,
} from './dto/admin-server-verification.dto';
import {
    AdminServerDetailsDTO,
    AdminChannelShortDTO,
} from './dto/admin-servers-details.response.dto';
import type { ServerVerificationService } from '@/services/ServerVerificationService';
import type { ServerDiscoveryService } from '@/services/ServerDiscoveryService';
import {
    CreateAdminNoteRequestDTO,
    UpdateAdminNoteRequestDTO,
    SoftDeleteAdminNoteRequestDTO,
    AdminNoteAdminInfoDTO,
    AdminNoteResponseDTO,
} from './dto/admin-notes.dto';
import { AdminListUsersRequestDTO } from './dto/admin-list-users.request.dto';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { Permissions } from '@/modules/auth/permissions.decorator';

import { AuthenticatedRequest } from '@/middleware/auth';

import { NoBot } from '@/modules/auth/bot.decorator';

export enum AdminRank {
    REGULAR_USER = 0,
    MODERATOR = 1,
    ADMIN = 2,
    SUPER_ADMIN = 3,
}

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@NoBot()
@Controller('api/v1/admin')
export class AdminController {
    public constructor(
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
        @Inject(TYPES.AuditLogRepository)
        private auditLogRepo: IAuditLogRepository,
        @Inject(TYPES.FriendshipRepository)
        private friendshipRepo: IFriendshipRepository,
        @Inject(TYPES.WsServer)
        private wsServer: IWsServer,
        @Inject(TYPES.Logger)
        private logger: ILogger,
        @Inject(TYPES.BanRepository)
        private banRepo: IBanRepository,
        @Inject(TYPES.MuteRepository)
        private muteRepo: IMuteRepository,
        @Inject(TYPES.ServerRepository)
        private serverRepo: IServerRepository,
        @Inject(TYPES.MessageRepository)
        private messageRepo: IMessageRepository,
        @Inject(TYPES.ServerMessageRepository)
        private serverMessageRepo: IServerMessageRepository,
        @Inject(TYPES.WarningRepository)
        private warningRepo: IWarningRepository,
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @Inject(TYPES.ChannelRepository)
        private channelRepo: IChannelRepository,
        @Inject(TYPES.InviteRepository)
        private inviteRepo: IInviteRepository,
        @Inject(TYPES.AdminNoteRepository)
        private adminNoteRepo: IAdminNoteRepository,
        @Inject(TYPES.ServerVerificationService)
        private serverVerificationService: ServerVerificationService,
        @Inject(TYPES.ServerDiscoveryService)
        private discoveryService: ServerDiscoveryService,
    ) {}

    @Get('stats')
    @Permissions('viewLogs')
    @ApiOperation({
        summary: 'Retrieve high-level statistics for the admin dashboard',
    })
    @ApiResponse({ status: 200, type: DashBoardStatsDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async getStats(
        @Query('range') range: '24h' | '7d' | '30d' | 'all' = '24h',
    ): Promise<DashBoardStatsDTO> {
        const now = new Date();

        const isHourly = range === '24h';
        const isLifetime = range === 'all';
        const buckets = range === '30d' ? 30 : range === '7d' ? 7 : 24;
        const msWindow =
            range === '30d'
                ? 30 * 24 * 60 * 60 * 1000
                : range === '7d'
                  ? 7 * 24 * 60 * 60 * 1000
                  : 24 * 60 * 60 * 1000;
        const since = new Date(now.getTime() - msWindow);

        const [
            users,
            bans,
            servers,
            dmMessages,
            serverMessages,
            usersSparkline,
            bansSparkline,
            serversSparkline,
            dmSparkline,
            serverMsgSparkline,
        ] = await Promise.all([
            this.userRepo.count(),
            this.banRepo.countActive(),
            this.serverRepo.count(),
            this.messageRepo.count(),
            this.serverMessageRepo.count(),
            isLifetime
                ? this.userRepo.countAllByDay()
                : isHourly
                  ? this.userRepo.countByHour(since, buckets)
                  : this.userRepo.countByDay(since, buckets),
            isLifetime
                ? this.banRepo.countAllByDay()
                : isHourly
                  ? this.banRepo.countByHour(since, buckets)
                  : this.banRepo.countByDay(since, buckets),
            isLifetime
                ? this.serverRepo.countAllByDay()
                : isHourly
                  ? this.serverRepo.countByHour(since, buckets)
                  : this.serverRepo.countByDay(since, buckets),
            isLifetime
                ? this.messageRepo.countAllByDay()
                : isHourly
                  ? this.messageRepo.countByHour(since, buckets)
                  : this.messageRepo.countByDay(since, buckets),
            isLifetime
                ? this.serverMessageRepo.countAllByDay()
                : isHourly
                  ? this.serverMessageRepo.countByHour(since, buckets)
                  : this.serverMessageRepo.countByDay(since, buckets),
        ]);

        let messagesSparkline: number[];
        if (isLifetime) {
            const maxLen = Math.max(
                dmSparkline.length,
                serverMsgSparkline.length,
            );
            messagesSparkline = Array(maxLen).fill(0);
            for (let i = 0; i < maxLen; i++) {
                const dmVal = dmSparkline[dmSparkline.length - 1 - i] ?? 0;
                const smVal =
                    serverMsgSparkline[serverMsgSparkline.length - 1 - i] ?? 0;
                messagesSparkline[maxLen - 1 - i] = dmVal + smVal;
            }
        } else {
            messagesSparkline = dmSparkline.map(
                (v, i) => v + (serverMsgSparkline[i] ?? 0),
            );
        }

        const activeUsersCount = this.wsServer.getAllOnlineUsers().length;

        const stats = new DashBoardStatsDTO();
        stats.users = users;
        stats.usersSparkline = usersSparkline;
        stats.activeUsers = activeUsersCount;
        stats.activeUsersSparkline = Array<number>(
            isLifetime ? usersSparkline.length : buckets,
        ).fill(0);
        stats.bans = bans;
        stats.bansSparkline = bansSparkline;
        stats.servers = servers;
        stats.serversSparkline = serversSparkline;
        stats.messages = dmMessages + serverMessages;
        stats.messagesSparkline = messagesSparkline;
        return stats;
    }

    @Get('users')
    @Permissions('viewUsers')
    @ApiOperation({ summary: 'List users with optional search and filtering' })
    @ApiResponse({ status: 200, type: [AdminUserListItemDTO] })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async listUsers(
        @Query() query: AdminListUsersRequestDTO,
    ): Promise<AdminUserListItemDTO[]> {
        const safeLimit = Math.min(Math.max(Number(query.limit ?? 50), 1), 200);
        // Build query options based on query parameters
        const options: Record<string, unknown> = {
            limit: safeLimit,
            offset: Number(query.offset ?? 0),
            includeDeleted: query.includeDeleted === true,
        };
        if (query.search !== undefined && query.search !== '')
            options.search = query.search;
        if (query.filter !== undefined) options.filter = query.filter;

        const users = toApiId(
            await this.userRepo.findMany(options),
        ) as ApiUser[];

        // Enriched users include ban status and warning counts
        const enrichedUsers = await Promise.all(
            users.map(async (user) => {
                const activeBan = await this.banRepo.findActiveByUserId(
                    user.id,
                );
                const activeMute = await this.muteRepo.findActiveByUserId(
                    user.id,
                );
                const warningCount = await this.warningRepo.countByUserId(
                    user.id,
                );
                const item = new AdminUserListItemDTO();
                item.id = user.id;
                item.username = user.username ?? '';
                item.login = user.login ?? '';
                item.displayName =
                    user.displayName !== undefined ? user.displayName : null;
                item.profilePicture =
                    user.profilePicture !== undefined
                        ? user.profilePicture
                        : null;
                item.permissions = user.permissions ?? '0';
                item.createdAt = user.createdAt ?? new Date();
                item.banExpiry = activeBan?.expirationTimestamp;
                item.muteExpiry = activeMute?.expirationTimestamp;
                item.muteActive = activeMute !== null;
                item.muteReason = activeMute?.reason;
                item.warningCount = warningCount;
                item.badges = user.badges ?? [];
                return item;
            }),
        );

        return enrichedUsers;
    }

    @Get('users/admins')
    @Permissions('viewUsers')
    @ApiOperation({ summary: 'List all administrators (short info)' })
    @ApiResponse({ status: 200, type: [AdminUserShortDTO] })
    public async listAdmins(): Promise<AdminUserShortDTO[]> {
        const users = toApiId(
            await this.userRepo.findMany({
                filter: 'admin',
                limit: 1000,
            }),
        ) as ApiUser[];

        return users.map((user) => {
            const dto = new AdminUserShortDTO();
            dto.id = user.id;
            dto.username = user.username ?? '';
            dto.displayName =
                user.displayName !== undefined ? user.displayName : null;
            return dto;
        });
    }

    @Post('users/:userId/reset')
    @HttpCode(200)
    @Permissions('manageUsers')
    @ApiOperation({ summary: 'Reset specific profile fields for a user' })
    @ApiResponse({ status: 200, type: AdminResetProfileResponseDTO })
    @ApiResponse({ status: 400, description: 'Invalid fields' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'User not found' })
    public async resetUserProfile(
        @Path('userId') userId: string,
        @Body() requestBody: AdminResetProfileRequestDTO,
        @Request() req: AuthenticatedRequest,
    ): Promise<AdminResetProfileResponseDTO> {
        const { fields } = requestBody;
        const user = toApiId(
            await this.userRepo.findById(userId),
        ) as ApiUser | null;
        if (user === null) {
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        const updateData: Record<string, unknown> = {};
        const oldUsername = user.username ?? '';
        let usernameChanged = false;

        if (fields.includes(ProfileFieldDTO.USERNAME)) {
            // Randomize username to avoid collisions and force logout
            const randomHex = crypto.randomBytes(8).toString('hex');
            updateData.username = `user_${randomHex}`;
            usernameChanged = true;
        }
        if (fields.includes(ProfileFieldDTO.DISPLAY_NAME))
            updateData.displayName = '';
        if (fields.includes(ProfileFieldDTO.PRONOUNS)) updateData.pronouns = '';
        if (fields.includes(ProfileFieldDTO.BIO)) updateData.bio = '';
        if (fields.includes(ProfileFieldDTO.BANNER)) updateData.banner = null;

        await this.userRepo.update(userId, updateData);

        await this.logAdminAction(req, 'reset_user_profile', userId, {
            fields,
        });

        if (usernameChanged) {
            try {
                const updatedUser = await this.userRepo.findById(userId);

                const event: IUserUpdatedEvent = {
                    type: 'user_updated',
                    payload: {
                        userId,
                        oldUsername,
                        newUsername: updateData.username as string,
                        profilePicture:
                            updatedUser?.profilePicture !== undefined &&
                            updatedUser.profilePicture !== ''
                                ? `/api/v1/profile/picture/${updatedUser.profilePicture}`
                                : null,
                        usernameFont: updatedUser?.usernameFont,
                        usernameGradient: updatedUser?.usernameGradient,
                        usernameGlow: updatedUser?.usernameGlow,
                    },
                };
                this.wsServer.broadcastToAll(event);

                const sockets = this.wsServer.getUserSockets(userId);
                if (sockets.length > 0) {
                    sockets.forEach((ws) => {
                        this.wsServer.closeConnection(
                            ws,
                            1008,
                            'Your username has been reset by a moderator.',
                        );
                    });
                }
            } catch (err) {
                this.logger.error(
                    'Failed to emit username change in NestJS controller:',
                    err,
                );
            }
        }

        const response = new AdminResetProfileResponseDTO();
        response.message = 'User profile fields reset';
        response.fields = fields;
        return response;
    }

    private getAdminRank(permissions: AdminPermissions | undefined): AdminRank {
        if (permissions === undefined) return AdminRank.REGULAR_USER;
        if (permissions.adminAccess === true) return AdminRank.SUPER_ADMIN;
        if (permissions.banUsers === true) return AdminRank.ADMIN;
        const permsRecord = permissions as Record<string, unknown>;
        const hasModPermissions = Object.keys(permsRecord).some(
            (key) =>
                key !== 'adminAccess' &&
                key !== 'banUsers' &&
                permsRecord[key] === true,
        );
        if (hasModPermissions) return AdminRank.MODERATOR;
        return AdminRank.REGULAR_USER;
    }

    private async checkHierarchy(
        callerId: string,
        targetUserId: string,
    ): Promise<void> {
        const caller = await this.userRepo.findById(callerId);
        if (caller === null) {
            throw new ForbiddenException(ErrorMessages.AUTH.UNAUTHORIZED);
        }

        const target = await this.userRepo.findById(targetUserId);
        if (target === null) {
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        const callerRank = this.getAdminRank(caller.permissions);
        const targetRank = this.getAdminRank(target.permissions);

        if (callerRank <= targetRank) {
            throw new ForbiddenException(
                'Insufficient permissions: Cannot manage a user with an equal or higher rank',
            );
        }
    }

    private async logAdminAction(
        req: AuthenticatedRequest,
        actionType: string,
        targetUserId?: string,
        additionalData?: Record<string, unknown>,
        targetId?: string,
        targetType?: string,
        serverId?: string,
    ): Promise<void> {
        try {
            const safeData: Record<string, unknown> = {};
            if (additionalData !== undefined) {
                if (additionalData.reason !== undefined)
                    safeData.reason = additionalData.reason;
                if (additionalData.duration !== undefined)
                    safeData.duration = additionalData.duration;
                if (additionalData.count !== undefined)
                    safeData.count = additionalData.count;
                if (additionalData.serverId !== undefined)
                    safeData.serverId = additionalData.serverId;
                if (additionalData.serverName !== undefined)
                    safeData.serverName = additionalData.serverName;
                if (additionalData.fields !== undefined)
                    safeData.fields = additionalData.fields;
                if (additionalData.noteId !== undefined)
                    safeData.noteId = additionalData.noteId;
                if (additionalData.content !== undefined)
                    safeData.content =
                        typeof additionalData.content === 'string'
                            ? additionalData.content.substring(0, 100)
                            : additionalData.content;
            }

            const actorId = req.user.id;

            if (actorId === '') {
                throw new ForbiddenException(ErrorMessages.AUTH.UNAUTHORIZED);
            }

            const auditData: {
                actorId: string;
                actionType: string;
                additionalData: Record<string, unknown>;
                targetUserId?: string;
                targetId?: string;
                targetType?: IAuditLog['targetType'];
                serverId?: string;
            } = {
                actorId,
                actionType,
                additionalData: safeData,
            };

            if (targetUserId !== undefined && targetUserId !== '') {
                auditData.targetUserId = targetUserId;
            }
            if (targetId !== undefined && targetId !== '') {
                auditData.targetId = targetId;
            }

            if (targetType !== undefined && targetType !== '') {
                auditData.targetType =
                    targetType.toLowerCase() as IAuditLog['targetType'];
            }

            if (serverId !== undefined && serverId !== '') {
                auditData.serverId = serverId;
            }

            await this.auditLogRepo.create(auditData);
        } catch (error) {
            this.logger.error('Audit log error:', error);
        }
    }

    @Post('users/:userId/soft-delete')
    @HttpCode(200)
    @Permissions('manageUsers')
    @ApiOperation({ summary: 'Soft deletes a user account' })
    @ApiResponse({ status: 200, type: AdminSoftDeleteUserResponseDTO })
    @ApiResponse({ status: 400, description: 'User already deleted' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'User not found' })
    public async softDeleteUser(
        @Path('userId') userId: string,
        @Body() body: AdminSoftDeleteUserRequestDTO,
        @Request() req: AuthenticatedRequest,
    ): Promise<AdminSoftDeleteUserResponseDTO> {
        const { reason = 'No reason provided' } = body;

        const user = toApiId(
            await this.userRepo.findById(userId),
        ) as ApiUser | null;
        if (user === null) {
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        if (user.deletedAt !== undefined) {
            throw new BadRequestException(
                ErrorMessages.AUTH.USER_ALREADY_DELETED,
            );
        }

        const oldUsername = user.username ?? '';
        const oldAvatar = user.profilePicture;

        const anonymizedUsername =
            user.anonymizedUsername !== undefined &&
            user.anonymizedUsername !== ''
                ? user.anonymizedUsername
                : generateAnonymizedUsername(userId);

        await this.userRepo.update(userId, {
            deletedAt: new Date(),
            deletedReason: reason,
            profilePicture: DELETED_AVATAR_PATH,
            login: `deleted_${userId}`,
            anonymizedUsername,
            tokenVersion: (user.tokenVersion ?? 0) + 1,
        });

        if (oldAvatar !== undefined && oldAvatar !== '') {
            await deleteAvatarFile(oldAvatar);
        }

        await this.friendshipRepo.deleteAllRequestsForUser(userId);

        await this.logAdminAction(req, 'soft_delete_user', userId, {
            reason,
        });

        const friendships = await this.friendshipRepo.findAllByUserId(userId);
        const offlineFriends: string[] = [];

        const event: IUserUpdatedEvent = {
            type: 'user_updated',
            payload: {
                userId,
                oldUsername,
                newUsername: anonymizedUsername,
                profilePicture: DELETED_AVATAR_PATH,
            },
        };

        for (const friendship of friendships) {
            const friendUsername =
                friendship.userId.toString() === userId
                    ? friendship.friend
                    : friendship.user;

            const friendUser = await this.userRepo.findByUsername(
                friendUsername ?? '',
            );
            if (friendUser !== null) {
                const friendUserId = friendUser.snowflakeId;
                if (await this.wsServer.isUserOnline(friendUserId)) {
                    this.wsServer.broadcastToUser(friendUserId, event);
                } else {
                    offlineFriends.push(friendUserId);
                }
            }
        }

        const deletedUserSockets = this.wsServer.getUserSockets(userId);
        if (deletedUserSockets.length > 0) {
            deletedUserSockets.forEach((ws) => {
                this.wsServer.closeConnection(
                    ws,
                    1008,
                    'Account has been deleted',
                );
            });
        }

        const response = new AdminSoftDeleteUserResponseDTO();
        response.message = 'User soft deleted';
        response.anonymizedUsername = anonymizedUsername;
        response.offlineFriends = offlineFriends.length;
        return response;
    }

    @Delete('users/:userId')
    @Permissions('manageUsers')
    @ApiOperation({
        summary: 'Legacy delete endpoint that forwards to soft delete',
    })
    @ApiResponse({ status: 200, type: AdminDeleteUserResponseDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'User not found' })
    public async deleteUser(
        @Path('userId') userId: string,
        @Body() body: AdminSoftDeleteUserRequestDTO,
        @Request() req: AuthenticatedRequest,
    ): Promise<AdminDeleteUserResponseDTO> {
        const result = await this.softDeleteUser(userId, body, req);
        const response = new AdminDeleteUserResponseDTO();
        response.message = 'User deleted';
        response.anonymizedUsername = result.anonymizedUsername;
        return response;
    }

    @Post('users/:userId/hard-delete')
    @HttpCode(200)
    @Permissions('manageUsers')
    @ApiOperation({ summary: 'Hard deletes a user account completely' })
    @ApiResponse({ status: 200, type: AdminHardDeleteUserResponseDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'User not found' })
    public async hardDeleteUser(
        @Path('userId') userId: string,
        @Body() body: AdminSoftDeleteUserRequestDTO,
        @Request() req: AuthenticatedRequest,
    ): Promise<AdminHardDeleteUserResponseDTO> {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const { reason = 'No reason provided' } = body;

            const user = await this.userRepo.findById(userId);
            if (user === null) {
                await session.abortTransaction();
                throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
            }

            const username = user.username ?? '';
            const oldAvatar = user.profilePicture;

            const sentMessagesUpdated =
                await this.messageRepo.updateManyBySenderId(userId, {
                    senderDeleted: true,
                    anonymizedSender: 'Deleted User',
                });

            const receivedMessagesUpdated =
                await this.messageRepo.updateManyByReceiverId(userId, {
                    receiverDeleted: true,
                    anonymizedReceiver: 'Deleted User',
                });

            const friendships =
                await this.friendshipRepo.findAllByUserId(userId);

            await this.friendshipRepo.deleteAllForUser(userId);
            await this.friendshipRepo.deleteAllRequestsForUser(userId);
            await this.warningRepo.deleteAllForUser(userId);
            await this.banRepo.deleteAllForUser(userId);
            await this.muteRepo.deleteAllForUser(userId);
            await this.userRepo.incrementTokenVersion(userId);

            if (oldAvatar !== undefined && oldAvatar !== DELETED_AVATAR_PATH) {
                await deleteAvatarFile(oldAvatar);
            }

            await this.userRepo.hardDelete(userId);

            await this.logAdminAction(req, 'hard_delete_user', userId, {
                reason,
            });

            await session.commitTransaction();

            const offlineFriends: string[] = [];

            const event: IUserUpdatedEvent = {
                type: 'user_updated',
                payload: {
                    userId,
                    oldUsername: username,
                    newUsername: 'Deleted User',
                    profilePicture: DELETED_AVATAR_PATH,
                },
            };

            for (const friendship of friendships) {
                const friendUsername =
                    friendship.userId.toString() === userId
                        ? friendship.friend
                        : friendship.user;

                const friendUser = await this.userRepo.findByUsername(
                    friendUsername ?? '',
                );
                if (friendUser !== null) {
                    const friendUserId = friendUser.snowflakeId;
                    if (await this.wsServer.isUserOnline(friendUserId)) {
                        this.wsServer.broadcastToUser(friendUserId, event);
                    } else {
                        offlineFriends.push(friendUserId);
                    }
                }
            }

            const deletedUserSockets = this.wsServer.getUserSockets(userId);
            if (deletedUserSockets.length > 0) {
                deletedUserSockets.forEach((ws) => {
                    this.wsServer.closeConnection(
                        ws,
                        1008,
                        'Account has been deleted',
                    );
                });
            }

            const response = new AdminHardDeleteUserResponseDTO();
            response.message = 'User and associated data hard deleted';
            response.sentMessagesAnonymized = sentMessagesUpdated.modifiedCount;
            response.receivedMessagesAnonymized =
                receivedMessagesUpdated.modifiedCount;
            response.offlineFriends = offlineFriends.length;
            return response;
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            await session.endSession();
        }
    }

    @Put('users/:userId/permissions')
    @Permissions('manageUsers')
    @ApiOperation({ summary: "Update a user's permissions" })
    @ApiResponse({ status: 200, type: AdminUpdateUserPermissionsResponseDTO })
    @ApiResponse({ status: 400, description: 'Invalid permissions' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'User not found' })
    public async updateUserPermissions(
        @Path('userId') userId: string,
        @Body() body: AdminUpdateUserPermissionsRequestDTO,
        @Request() req: AuthenticatedRequest,
    ): Promise<AdminUpdateUserPermissionsResponseDTO> {
        const { permissions } = body;

        const user = toApiId(
            await this.userRepo.findById(userId),
        ) as ApiUser | null;
        if (user === null) {
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        if (userId === req.user.id) {
            throw new BadRequestException('Cannot modify your own permissions');
        }

        await this.checkHierarchy(req.user.id, userId);

        const caller = await this.userRepo.findById(req.user.id);
        if (caller !== null) {
            const callerRank = this.getAdminRank(caller.permissions);
            const newTargetRank = this.getAdminRank(permissions);
            if (callerRank <= newTargetRank) {
                throw new ForbiddenException(
                    'Insufficient permissions: Cannot promote a user to a rank equal or higher than your own',
                );
            }
        }

        await this.userRepo.updatePermissions(userId, permissions);
        await this.logAdminAction(req, 'update_permissions', userId, {
            permissions,
        });

        const response = new AdminUpdateUserPermissionsResponseDTO();
        response.message = 'Permissions updated';
        return response;
    }

    @Post('users/:userId/ban')
    @HttpCode(200)
    @Permissions('banUsers')
    @ApiOperation({ summary: 'Ban a user for a specified duration' })
    @ApiResponse({ status: 200, type: AdminBanUserResponseDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'User not found' })
    public async banUser(
        @Path('userId') userId: string,
        @Body() body: AdminBanUserRequestDTO,
        @Request() req: AuthenticatedRequest,
    ): Promise<AdminBanUserResponseDTO> {
        const { reason, duration } = body;

        const targetUser = await this.userRepo.findById(userId);
        if (targetUser === null) {
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        await this.checkHierarchy(req.user.id, userId);

        const expirationTimestamp = new Date(Date.now() + duration * 60 * 1000);
        const issuedBy = req.user.id;
        if (issuedBy === '') {
            throw new ForbiddenException(ErrorMessages.AUTH.UNAUTHORIZED);
        }

        const ban = await this.banRepo.createOrUpdateWithHistory({
            userId: userId,
            reason: reason.trim(),
            issuedBy,
            expirationTimestamp,
        });

        await this.logAdminAction(req, 'ban_user', userId, {
            reason: reason.trim(),
            duration,
        });

        const serverMemberships =
            await this.serverMemberRepo.findAllByUserId(userId);

        for (const membership of serverMemberships) {
            await this.serverMemberRepo.deleteById(membership.snowflakeId);

            const event: IMemberRemovedEvent = {
                type: 'member_removed',
                payload: {
                    serverId: membership.serverId.toString(),
                    userId,
                },
            };
            this.wsServer.broadcastToServer(
                membership.serverId.toString(),
                event,
            );
        }

        const sockets = this.wsServer.getUserSockets(userId);
        if (sockets.length > 0) {
            sockets.forEach((ws) => {
                this.wsServer.closeConnection(
                    ws,
                    1008,
                    `Banned: ${reason.trim()}`,
                );
            });
        }

        const response = new AdminBanUserResponseDTO();
        response.id = ban.snowflakeId;
        response.userId = ban.userId.toString();
        response.reason = ban.reason;
        response.issuedBy =
            ban.issuedBy !== undefined ? ban.issuedBy.toString() : 'unknown';
        response.expirationTimestamp =
            ban.expirationTimestamp !== undefined
                ? ban.expirationTimestamp
                : new Date();
        response.active = ban.active;
        response.history = (ban.history ?? []).map((h) => ({
            reason: h.reason,
            timestamp: h.timestamp,
            expirationTimestamp: h.expirationTimestamp ?? new Date(),
            issuedBy: h.issuedBy.toString(),
            active: false,
        }));
        return response;
    }

    @Post('users/:userId/unban')
    @HttpCode(200)
    @Permissions('banUsers')
    @ApiOperation({ summary: 'Unban a user' })
    @ApiResponse({ status: 200, type: AdminUnbanUserResponseDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async unbanUser(
        @Path('userId') userId: string,
        @Request() req: AuthenticatedRequest,
    ): Promise<AdminUnbanUserResponseDTO> {
        const targetUser = await this.userRepo.findById(userId);
        if (targetUser === null) {
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }
        await this.checkHierarchy(req.user.id, userId);
        await this.banRepo.deactivateAllForUser(userId);
        await this.logAdminAction(req, 'unban_user', userId);
        const response = new AdminUnbanUserResponseDTO();
        response.message = 'User unbanned';
        return response;
    }

    @Get('users/:userId/bans')
    @Permissions('viewBans')
    @ApiOperation({ summary: 'Retrieve ban history for a user' })
    @ApiResponse({ status: 200, type: [AdminBanHistoryItemDTO] })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async getUserBanHistory(
        @Path('userId') userId: string,
    ): Promise<AdminUserBanHistoryResponseDTO> {
        const ban = await this.banRepo.findByUserIdWithHistory(userId);
        if (
            ban === null ||
            ban.history === undefined ||
            ban.history.length === 0
        ) {
            return [];
        }

        const historyWithStatus: AdminUserBanHistoryResponseDTO =
            ban.history.map((entry, index: number) => {
                const item = new AdminBanHistoryItemDTO();
                const e = toApiId(entry) as Record<string, unknown>;
                item.id = String(e.id ?? '');
                item.reason = String(e.reason ?? '');
                item.timestamp = e.timestamp as Date;
                item.expirationTimestamp = e.expirationTimestamp as Date;
                item.issuedBy = String(e.issuedBy ?? 'unknown');
                item.active =
                    index === (ban.history as unknown[]).length - 1 &&
                    ban.active === true;
                return item;
            });
        return historyWithStatus;
    }

    private async mapBanOrMuteList(
        records: (IBan | IMute)[],
    ): Promise<AdminBanListItemDTO[]> {
        const userIds = [
            ...new Set(
                records.flatMap((r) =>
                    [r.userId, r.issuedBy].filter(
                        (id): id is string => id !== undefined,
                    ),
                ),
            ),
        ];
        const users =
            userIds.length > 0 ? await this.userRepo.findByIds(userIds) : [];
        const userById = new Map(users.map((u) => [u.snowflakeId, u]));

        return records.map((r) => {
            const item = new AdminBanListItemDTO();
            item.id = r.snowflakeId;
            item.userId = r.userId;
            const user = userById.get(r.userId);
            if (user) item.user = this.mapAdminInfo(r.userId, user);
            item.reason = r.reason;
            item.active = r.active;
            item.expirationTimestamp = r.expirationTimestamp;
            item.createdAt = r.createdAt;
            item.timestamp = r.timestamp;
            item.issuedBy = r.issuedBy;
            if (r.issuedBy !== undefined) {
                const issuedByUser = userById.get(r.issuedBy);
                if (issuedByUser) {
                    item.issuedByUser = this.mapAdminInfo(
                        r.issuedBy,
                        issuedByUser,
                    );
                }
            }
            return item;
        });
    }

    @Get('bans')
    @Permissions('viewBans')
    @ApiOperation({ summary: 'List all bans with pagination' })
    @ApiResponse({ status: 200, type: [Object] })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async listBans(
        @Query('limit') limit: number = 50,
        @Query('offset') offset: number = 0,
    ): Promise<AdminBanListResponseDTO> {
        const safeLimit = Math.min(Math.max(Number(limit), 1), 200);
        const bans = await this.banRepo.findAll({
            limit: safeLimit,
            offset: Number(offset),
        });
        return this.mapBanOrMuteList(bans);
    }

    @Get('bans/diagnostic')
    @Permissions('viewBans')
    @ApiOperation({ summary: 'Diagnostic endpoint for ban collections' })
    @ApiResponse({ status: 200, type: AdminBansDiagnosticResponseDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async getBansDiagnostic(): Promise<AdminBansDiagnosticResponseDTO> {
        const appBansCount = await Ban.countDocuments();
        const appBansSampleRaw: unknown = await Ban.find({}).limit(5).lean();

        const serverBansCount = await ServerBan.countDocuments();
        const serverBansSampleRaw: unknown = await ServerBan.find({})
            .limit(5)
            .lean();

        const response = new AdminBansDiagnosticResponseDTO();
        response.appBans = {
            count: appBansCount,
            sample: appBansSampleRaw as AdminBanSampleDTO[],
        };
        response.serverBans = {
            count: serverBansCount,
            sample: serverBansSampleRaw as AdminBanSampleDTO[],
        };
        return response;
    }

    @Post('users/:userId/mute')
    @HttpCode(200)
    @Permissions('banUsers') // Reusing banUsers permission for mutes
    @ApiOperation({ summary: 'Mute a user globally' })
    @ApiResponse({ status: 200, type: AdminMuteUserResponseDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'User not found' })
    public async muteUser(
        @Path('userId') userId: string,
        @Body() body: AdminMuteUserRequestDTO,
        @Request() req: AuthenticatedRequest,
    ): Promise<AdminMuteUserResponseDTO> {
        const { reason, duration } = body;
        const issuedByIdStr = req.user.id;
        if (issuedByIdStr === '') {
            throw new ForbiddenException(ErrorMessages.AUTH.UNAUTHORIZED);
        }

        const user = await this.userRepo.findById(userId);
        if (user === null) {
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        await this.checkHierarchy(req.user.id, userId);

        let expirationTimestamp: Date | undefined;
        if (duration > 0) {
            expirationTimestamp = new Date();
            expirationTimestamp.setMinutes(
                expirationTimestamp.getMinutes() + duration,
            );
        }

        const mute = await this.muteRepo.createOrUpdateWithHistory({
            userId: userId,
            reason,
            issuedBy: issuedByIdStr,
            expirationTimestamp,
        });

        await this.logAdminAction(req, 'mute_user', userId, {
            reason,
            duration,
        });

        this.wsServer.broadcastToUser(userId, {
            type: 'user_updated',
            payload: {
                userId,
                activeMute: {
                    reason: mute.reason,
                    expirationTimestamp: mute.expirationTimestamp ?? null,
                },
            },
        });

        const response = new AdminMuteUserResponseDTO();
        response.id = mute.snowflakeId;
        response.userId = mute.userId.toString();
        response.reason = mute.reason;
        response.issuedBy =
            mute.issuedBy !== undefined ? mute.issuedBy.toString() : 'unknown';
        response.expirationTimestamp =
            mute.expirationTimestamp !== undefined
                ? mute.expirationTimestamp
                : new Date(8640000000000000); // Max date if permanent
        response.active = mute.active;
        response.history = (mute.history ?? []).map((h) => ({
            id: '',
            reason: String(h.reason),
            timestamp: h.timestamp,
            expirationTimestamp: h.expirationTimestamp as Date,
            issuedBy: String(h.issuedBy),
            active: false,
        }));
        return response;
    }

    @Post('users/:userId/unmute')
    @HttpCode(200)
    @Permissions('banUsers')
    @ApiOperation({ summary: 'Unmute a user globally' })
    @ApiResponse({ status: 200, type: AdminUnmuteUserResponseDTO })
    public async unmuteUser(
        @Path('userId') userId: string,
        @Request() req: AuthenticatedRequest,
    ): Promise<AdminUnmuteUserResponseDTO> {
        const targetUser = await this.userRepo.findById(userId);
        if (targetUser === null) {
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }
        await this.checkHierarchy(req.user.id, userId);
        await this.muteRepo.deactivateAllForUser(userId);
        await this.logAdminAction(req, 'unmute_user', userId);
        this.wsServer.broadcastToUser(userId, {
            type: 'user_updated',
            payload: {
                userId,
                activeMute: null,
            },
        });
        const response = new AdminUnmuteUserResponseDTO();
        response.message = 'User unmuted';
        return response;
    }

    @Get('users/:userId/mutes')
    @Permissions('viewBans')
    @ApiOperation({ summary: 'Retrieve mute history for a user' })
    @ApiResponse({ status: 200, type: [AdminBanHistoryItemDTO] })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async getUserMuteHistory(
        @Path('userId') userId: string,
    ): Promise<AdminUserBanHistoryResponseDTO> {
        const mute = await this.muteRepo.findByUserIdWithHistory(userId);
        if (
            mute === null ||
            mute.history === undefined ||
            mute.history.length === 0
        ) {
            return [];
        }

        const historyWithStatus: AdminUserBanHistoryResponseDTO =
            mute.history.map((entry, index: number) => {
                const item = new AdminBanHistoryItemDTO();
                const e = toApiId(entry) as Record<string, unknown>;
                item.id = String(e.id ?? '');
                item.reason = String(e.reason ?? '');
                item.timestamp = e.timestamp as Date;
                item.expirationTimestamp = e.expirationTimestamp as Date;
                item.issuedBy = String(e.issuedBy ?? 'unknown');
                item.active =
                    index === (mute.history as unknown[]).length - 1 &&
                    mute.active === true;
                return item;
            });
        return historyWithStatus;
    }

    @Get('mutes')
    @Permissions('viewBans')
    @ApiOperation({ summary: 'List all mutes with pagination' })
    @ApiResponse({ status: 200, type: [Object] })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async listMutes(
        @Query('limit') limit: number = 50,
        @Query('offset') offset: number = 0,
    ): Promise<AdminBanListResponseDTO> {
        const safeLimit = Math.min(Math.max(Number(limit), 1), 200);
        const mutes = await this.muteRepo.findAll({
            limit: safeLimit,
            offset: Number(offset),
        });
        return this.mapBanOrMuteList(mutes);
    }

    @Post('users/:userId/warn')
    @HttpCode(200)
    @Permissions('warnUsers')
    @ApiOperation({ summary: 'Warn a user' })
    @ApiResponse({ status: 200, type: AdminWarnUserResponseDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async warnUser(
        @Path('userId') userId: string,
        @Body() body: AdminWarnUserRequestDTO,
        @Request() req: AuthenticatedRequest,
    ): Promise<AdminWarnUserResponseDTO> {
        const { message } = body;
        const issuedByIdStr = req.user.id;
        if (issuedByIdStr === '') {
            throw new ForbiddenException(ErrorMessages.AUTH.UNAUTHORIZED);
        }

        const warning = await this.warningRepo.create({
            userId: userId,
            issuedBy: issuedByIdStr,
            message,
        });

        await this.logAdminAction(req, 'warn_user', userId, {
            reason: message,
        });

        const user = await this.userRepo.findById(userId);
        if (
            user !== null &&
            (await this.wsServer.isUserOnline(userId)) === true
        ) {
            const event: IWarningEvent = {
                type: 'warning',
                payload: {
                    id: warning.snowflakeId,
                    userId: warning.userId.toString(),
                    issuedBy: warning.issuedBy.toString(),
                    message: warning.message,
                    timestamp: warning.timestamp,
                    acknowledged: warning.acknowledged,
                    acknowledgedAt: warning.acknowledgedAt,
                },
            };
            this.wsServer.broadcastToUser(userId, event);
        }

        const response = new AdminWarnUserResponseDTO();
        response.id = warning.snowflakeId;
        response.userId = warning.userId.toString();
        response.issuedBy = warning.issuedBy.toString();
        response.message = warning.message;
        response.timestamp = warning.timestamp;
        return response;
    }

    @Get('users/:userId/warnings')
    @Permissions('warnUsers')
    @ApiOperation({ summary: 'Retrieve warnings for a user' })
    @ApiResponse({ status: 200, type: [AdminWarnUserResponseDTO] })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async getUserWarnings(
        @Path('userId') userId: string,
    ): Promise<AdminUserWarningsResponseDTO> {
        const warnings = await this.warningRepo.findByUserId(userId);
        return warnings.map((w) => {
            const dto = new AdminWarnUserResponseDTO();
            dto.id = w.snowflakeId;
            dto.userId = w.userId.toString();
            dto.issuedBy = w.issuedBy.toString();
            dto.message = w.message;
            dto.timestamp = w.timestamp;
            dto.acknowledged = w.acknowledged;
            dto.acknowledgedAt = w.acknowledgedAt;
            return dto;
        });
    }

    @Get('warnings')
    @Permissions('warnUsers')
    @ApiOperation({ summary: 'List all warnings with pagination' })
    @ApiResponse({ status: 200, type: [Object] })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async listWarnings(
        @Query('limit') limit: number = 50,
        @Query('offset') offset: number = 0,
    ): Promise<AdminWarningListResponseDTO> {
        const safeLimit = Math.min(Math.max(Number(limit), 1), 200);
        const warnings = await this.warningRepo.findAll({
            limit: safeLimit,
            offset: Number(offset),
        });
        return warnings.map((w) => {
            const dto = new AdminWarnUserResponseDTO();
            dto.id = w.snowflakeId;
            dto.userId = w.userId.toString();
            dto.issuedBy = w.issuedBy.toString();
            dto.message = w.message;
            dto.timestamp = w.timestamp;
            dto.acknowledged = w.acknowledged;
            dto.acknowledgedAt = w.acknowledgedAt;
            return dto;
        });
    }

    @Get('logs')
    @Permissions('viewLogs')
    @ApiOperation({ summary: 'List audit logs with pagination' })
    @ApiResponse({ status: 200, type: [Object] })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async listAuditLogs(
        @Query() query: AdminListAuditLogsRequestDTO,
    ): Promise<AdminAuditLogListResponseDTO> {
        const safeLimit = Math.min(
            Math.max(Number(query.limit ?? 100), 1),
            200,
        );
        const logs = await this.auditLogRepo.find({
            serverId: null,
            limit: safeLimit,
            offset: Number(query.offset ?? 0),
            actorId:
                query.actorId !== undefined && query.actorId !== ''
                    ? query.actorId
                    : undefined,
            actionType: query.actionType,
            targetUserId:
                query.targetUserId !== undefined && query.targetUserId !== ''
                    ? query.targetUserId
                    : undefined,
            startDate:
                query.startDate !== undefined && query.startDate !== ''
                    ? new Date(query.startDate)
                    : undefined,
            endDate:
                query.endDate !== undefined && query.endDate !== ''
                    ? new Date(query.endDate)
                    : undefined,
        });
        return logs.map((log) => {
            const item = new AdminAuditLogListItemDTO();
            item.id = log.snowflakeId;
            item.serverId = log.serverId;
            item.actorId = log.actorId;
            if (log.actorIdUser) {
                item.actorIdUser = this.mapAdminInfo(
                    log.actorId,
                    log.actorIdUser,
                );
            }
            item.actionType = log.actionType;
            item.targetId = log.targetId;
            item.targetType = log.targetType;
            item.targetUserId = log.targetUserId;
            if (log.targetUserId !== undefined && log.targetUserIdUser) {
                item.targetUserIdUser = this.mapAdminInfo(
                    log.targetUserId,
                    log.targetUserIdUser,
                );
            }
            item.changes = log.changes as AdminAuditLogChangeDTO[] | undefined;
            item.reason = log.reason;
            item.additionalData = log.additionalData as
                | AdminAuditLogJsonObject
                | undefined;
            item.timestamp = log.timestamp;
            return item;
        });
    }

    @Get('servers')
    @Permissions('manageServer')
    @ApiOperation({ summary: 'List servers with owner details' })
    @ApiResponse({ status: 200, type: [AdminServerListItemDTO] })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async listServers(
        @Query('limit') limit: number = 50,
        @Query('offset') offset: number = 0,
        @Query('search') search?: string,
    ): Promise<AdminServerListResponseDTO> {
        const safeLimit = Math.min(Math.max(Number(limit), 1), 200);
        const servers = await this.serverRepo.findMany({
            limit: safeLimit,
            offset: Number(offset),
            search: search,
            includeDeleted: true,
        });

        const ownerIds = [...new Set(servers.map((s) => s.ownerId))].filter(
            (id) => isValidSnowflakeId(id),
        );
        const owners = toApiId(
            await this.userRepo.findByIds(ownerIds),
        ) as ApiUser[];

        const enrichedServers = await Promise.all(
            servers.map(async (server) => {
                const owner = owners.find((u) => u.id === server.ownerId);
                const memberCount = await this.serverMemberRepo.countByServerId(
                    server.id,
                );
                const item = new AdminServerListItemDTO();
                const enrichedServer = server as IServer & {
                    realMessageCount?: number;
                    weightScore?: number;
                };

                item.id = server.id;
                item.name = server.name;
                item.description = server.description;
                item.icon =
                    server.icon !== undefined && server.icon !== ''
                        ? `${server.icon}`
                        : null;
                item.banner = server.banner;
                item.ownerId = server.ownerId.toString();
                item.memberCount = memberCount;
                item.createdAt = server.createdAt ?? new Date();
                item.deletedAt = server.deletedAt;
                item.verified = server.verified ?? false;
                item.verificationScore = server.verificationScore ?? 0;
                item.verificationEligible =
                    server.verificationEligible ?? false;
                item.verificationLastComputedAt =
                    server.verificationLastComputedAt;
                item.verificationFailureReasons =
                    server.verificationFailureReasons ?? [];
                item.verificationOverride = server.verificationOverride ?? null;
                item.verificationRequested =
                    server.verificationRequested ?? false;
                item.discoveryEnabled = server.discoveryEnabled ?? false;
                item.realMessageCount = enrichedServer.realMessageCount;
                item.weightScore = enrichedServer.weightScore;
                if (owner) {
                    item.owner = {
                        id: owner.id,
                        username: owner.username ?? '',
                        displayName: owner.displayName ?? null,
                        profilePicture:
                            owner.profilePicture !== undefined &&
                            owner.profilePicture !== ''
                                ? `/api/v1/profile/picture/${owner.profilePicture}`
                                : null,
                    };
                }
                return item;
            }),
        );

        return enrichedServers;
    }

    @Get('servers/verification')
    @Permissions('manageServer')
    @ApiOperation({ summary: 'Get server verification scoring stats' })
    @ApiResponse({ status: 200, type: AdminServerVerificationStatsDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async getServerVerificationStats(): Promise<AdminServerVerificationStatsDTO> {
        return await this.serverVerificationService.getStats();
    }

    @Post('servers/verification/run')
    @HttpCode(200)
    @Permissions('manageServer')
    @ApiOperation({ summary: 'Recompute server verification scores now' })
    @ApiResponse({ status: 200, type: AdminServerVerificationStatsDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async runServerVerificationNow(
        @Request() req: AuthenticatedRequest,
    ): Promise<AdminServerVerificationStatsDTO> {
        const stats = await this.serverVerificationService.recompute();
        await this.discoveryService.reindexPotentialServers();
        await this.logAdminAction(req, 'run_server_verification', undefined, {
            eligibleServerCount: stats.eligibleServerCount,
            verifiedServerCount: stats.verifiedServerCount,
        });
        return stats;
    }

    @Delete('servers/:serverId')
    @Permissions('manageServer')
    @ApiOperation({ summary: 'Soft deletes a server' })
    @ApiResponse({ status: 200, type: AdminDeleteServerResponseDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Server not found' })
    public async deleteServer(
        @Path('serverId') serverId: string,
        @Request() req: AuthenticatedRequest,
    ): Promise<AdminDeleteServerResponseDTO> {
        const server = await this.serverRepo.findById(serverId, true);
        if (server === null) {
            throw new NotFoundException(ErrorMessages.SERVER.NOT_FOUND);
        }

        await this.serverRepo.softDelete(serverId);
        await this.discoveryService.removeServer(serverId);

        const event: IServerDeletedEvent = {
            type: 'server_deleted',
            payload: { serverId },
        };
        this.wsServer.broadcastToServer(serverId, event);

        await this.logAdminAction(
            req,
            'delete_server',
            server.ownerId.toString(),
            { serverId, serverName: server.name },
        );

        const response = new AdminDeleteServerResponseDTO();
        response.message = 'Server deleted';
        return response;
    }

    // Restores a deleted server
    @Post('servers/:serverId/restore')
    @HttpCode(200)
    @Permissions('manageServer')
    @ApiOperation({ summary: 'Restore a deleted server' })
    @ApiResponse({ status: 200, type: AdminRestoreServerResponseDTO })
    @ApiResponse({ status: 400, description: 'Server not deleted' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Server not found' })
    public async restoreServer(
        @Path('serverId') serverId: string,
        @Request() req: AuthenticatedRequest,
    ): Promise<AdminRestoreServerResponseDTO> {
        const server = await this.serverRepo.findById(serverId, true);

        if (server === null) {
            throw new NotFoundException(ErrorMessages.SERVER.NOT_FOUND);
        }

        if (server.deletedAt !== undefined) {
            throw new BadRequestException(ErrorMessages.SERVER.NOT_DELETED);
        }

        await this.serverRepo.restore(serverId);
        await this.discoveryService.refreshServer(serverId);

        await this.logAdminAction(
            req,
            'restore_server',
            server.ownerId.toString(),
            { serverId, serverName: server.name },
        );

        const response = new AdminRestoreServerResponseDTO();
        response.message = 'Server restored';
        return response;
    }

    @Get('users/:userId/details')
    @Permissions('viewUsers')
    @ApiOperation({
        summary: 'Retrieve extended user details including servers',
    })
    @ApiResponse({ status: 200, type: AdminExtendedUserDetailsDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'User not found' })
    public async getExtendedUserDetails(
        @Path('userId') userId: string,
    ): Promise<AdminExtendedUserDetailsDTO> {
        const user = toApiId(
            await this.userRepo.findById(userId),
        ) as ApiUser | null;
        if (user === null) {
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        const profilePictureUrl =
            user.deletedAt !== undefined
                ? '/images/deleted-cat.jpg'
                : user.profilePicture !== undefined &&
                    user.profilePicture !== ''
                  ? `/api/v1/profile/picture/${user.profilePicture}`
                  : null;

        const memberships = await this.serverMemberRepo.findByUserId(userId);
        const serverIds = memberships.map((m) => m.serverId);
        const servers = await this.serverRepo.findByIds(serverIds);

        const serverList = await Promise.all(
            servers.map(async (server) => {
                const membership = memberships.find(
                    (m) => m.serverId.toString() === server.id,
                );
                const memberCount = await this.serverMemberRepo.countByServerId(
                    server.id,
                );
                return {
                    id: server.id,
                    name: server.name,
                    icon: server.icon ?? null,
                    banner: server.banner?.value ?? null,
                    ownerId: server.ownerId,
                    memberCount,
                    joinedAt: membership?.joinedAt,
                    isOwner: String(server.ownerId) === userId,
                };
            }),
        );

        const activeBan = await this.banRepo.findActiveByUserId(userId);
        const activeMute = await this.muteRepo.findActiveByUserId(userId);
        const warningCount = await this.warningRepo.countByUserId(userId);

        let badges: unknown[] = [];
        if (user.badges && user.badges.length > 0) {
            badges = await Badge.find({ id: { $in: user.badges } }).lean();
        }

        const response = new AdminExtendedUserDetailsDTO();
        response.id = user.id;
        response.username = user.username ?? '';
        response.login = user.login ?? '';
        response.displayName = user.displayName ?? null;
        response.profilePicture = profilePictureUrl;
        response.permissions =
            user.permissions !== undefined ? user.permissions : '0';
        response.createdAt = user.createdAt ?? new Date();
        response.banExpiry = activeBan?.expirationTimestamp;
        response.muteExpiry = activeMute?.expirationTimestamp;
        response.muteActive = activeMute !== null;
        response.muteReason = activeMute?.reason;
        response.warningCount = warningCount;
        response.bio = user.bio ?? '';
        response.pronouns = user.pronouns ?? '';
        response.badges = badges as string[];
        response.banner =
            user.banner !== undefined && user.banner !== ''
                ? `/api/v1/profile/banner/${user.banner}`
                : null;
        response.deletedAt = user.deletedAt;
        response.deletedReason = user.deletedReason;
        response.servers = serverList;
        response.decorationId = user.decorationId;
        response.bannerColor = user.bannerColor;
        response.profilePrimaryColor = user.profilePrimaryColor;
        response.profileAccentColor = user.profileAccentColor;
        response.usernameFont = user.usernameFont;
        response.usernameGradient = user.usernameGradient;
        response.usernameGlow = user.usernameGlow;
        response.customStatus = resolveSerializedCustomStatus(
            user.customStatus,
        );
        response.isPrivate = user.privacySettings?.privateProfile ?? false;
        response.privacySettings = {
            privateProfile: user.privacySettings?.privateProfile ?? false,
            hideDisplayName: user.privacySettings?.hideDisplayName ?? false,
            hidePronouns: user.privacySettings?.hidePronouns ?? false,
            hideConnections: user.privacySettings?.hideConnections ?? false,
            hideBio: user.privacySettings?.hideBio ?? false,
            hideStatus: user.privacySettings?.hideStatus ?? false,
        };

        const connections = await UserConnection.find({
            userId: user.id,
            status: 'verified',
        })
            .sort({ verifiedAt: 1, createdAt: 1 })
            .exec();
        response.connections = connections.map((connection) => ({
            id: connection.snowflakeId,
            type: connection.type,
            value: connection.value,
            status: connection.status,
        }));

        return response;
    }
    @Get('servers/awaiting-review')
    @Permissions('manageServer')
    @ApiOperation({ summary: 'List servers awaiting verification review' })
    @ApiResponse({ status: 200, type: [AdminServerListItemDTO] })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async listAwaitingReviewServers(
        @Query('limit') limit: number = 50,
        @Query('offset') offset: number = 0,
    ): Promise<{ items: AdminServerListResponseDTO; total: number }> {
        const safeLimit = Math.min(Math.max(Number(limit), 1), 200);
        const servers = await this.serverRepo.listAwaitingReview({
            limit: safeLimit,
            offset: Number(offset),
        });

        const total = await this.serverRepo.countAwaitingReview();

        const ownerIds = [...new Set(servers.map((s) => s.ownerId))].filter(
            (id) => isValidSnowflakeId(id),
        );
        const owners = toApiId(
            await this.userRepo.findByIds(ownerIds),
        ) as ApiUser[];

        const items = servers.map((server) => {
            const owner = owners.find((u) => u.id === server.ownerId);
            const item = new AdminServerListItemDTO();
            item.id = server.id;
            item.name = server.name;
            item.description = server.description;
            item.icon =
                server.icon !== undefined && server.icon !== ''
                    ? `${server.icon}`
                    : null;
            item.banner = server.banner;
            item.ownerId = server.ownerId.toString();
            item.memberCount = server.memberCount ?? 0;
            item.createdAt = server.createdAt ?? new Date();
            item.deletedAt = server.deletedAt;
            item.verified = server.verified ?? false;
            item.verificationScore = server.verificationScore ?? 0;
            item.verificationEligible = server.verificationEligible ?? false;
            item.verificationLastComputedAt = server.verificationLastComputedAt;
            item.verificationFailureReasons =
                server.verificationFailureReasons ?? [];
            item.verificationOverride = server.verificationOverride ?? null;
            item.verificationRequested = server.verificationRequested ?? false;
            item.discoveryEnabled = server.discoveryEnabled ?? false;
            item.realMessageCount = server.realMessageCount ?? 0;
            item.weightScore = server.weightScore ?? 0;

            if (owner) {
                item.owner = {
                    id: owner.id,
                    username: owner.username ?? '',
                    displayName: owner.displayName ?? null,
                    profilePicture:
                        owner.profilePicture !== undefined &&
                        owner.profilePicture !== ''
                            ? `/api/v1/profile/picture/${owner.profilePicture}`
                            : null,
                };
            }
            return item;
        });

        return { items, total };
    }

    @Get('servers/:serverId')
    @Permissions('manageServer')
    @ApiOperation({
        summary: 'Retrieve detailed information about a specific server',
    })
    @ApiResponse({ status: 200, type: AdminServerDetailsDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Server not found' })
    public async getServerDetails(
        @Path('serverId') serverId: string,
    ): Promise<AdminServerDetailsDTO> {
        const server = await this.serverRepo.findById(serverId, true);
        if (server === null) {
            throw new NotFoundException(ErrorMessages.SERVER.NOT_FOUND);
        }

        const owner = await this.userRepo.findById(server.ownerId);
        const memberCount =
            await this.serverMemberRepo.countByServerId(serverId);
        const messageVolume =
            await this.serverMessageRepo.countByServerId(serverId);
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [recentBanCount, recentKickCount] = await Promise.all([
            this.auditLogRepo.count({
                serverId: serverId,
                actionType: 'user_ban',
                startDate: since,
            }),
            this.auditLogRepo.count({
                serverId: serverId,
                actionType: 'user_kick',
                startDate: since,
            }),
        ]);
        const channels = await this.channelRepo.findByServerId(serverId);

        const details = new AdminServerDetailsDTO();
        details.id = server.id;
        details.name = server.name;
        details.description = server.description;
        details.icon =
            server.icon !== undefined && server.icon !== ''
                ? `${server.icon}`
                : null;
        details.banner = server.banner;
        details.ownerId = server.ownerId.toString();
        details.memberCount = memberCount;
        details.messageVolume = messageVolume;
        details.recentBanCount = recentBanCount;
        details.recentKickCount = recentKickCount;
        details.createdAt = server.createdAt ?? new Date();
        details.deletedAt = server.deletedAt;
        details.verified = server.verified ?? false;
        details.verificationScore = server.verificationScore ?? 0;
        details.verificationEligible = server.verificationEligible ?? false;
        details.verificationLastComputedAt = server.verificationLastComputedAt;
        details.verificationFailureReasons =
            server.verificationFailureReasons ?? [];
        details.verificationOverride = server.verificationOverride ?? null;
        details.verificationRequested = server.verificationRequested ?? false;
        details.discoveryEnabled = server.discoveryEnabled ?? false;

        if (owner !== null) {
            details.owner = {
                id: owner.snowflakeId,
                username: owner.username ?? '',
                displayName: owner.displayName ?? null,
                profilePicture:
                    owner.profilePicture !== undefined &&
                    owner.profilePicture !== ''
                        ? `/api/v1/profile/picture/${owner.profilePicture}`
                        : null,
            };
        } else {
            details.owner = null;
        }

        details.channels = channels.map((c) => {
            const dto = new AdminChannelShortDTO();
            dto.id = c.snowflakeId;
            dto.name = c.name;
            dto.type = c.type;
            dto.position = c.position;
            return dto;
        });

        return details;
    }

    @Get('servers/:serverId/invites')
    @Permissions('manageServer')
    @ApiOperation({ summary: 'List all invites for a server (Admin access)' })
    @ApiResponse({ status: 200, type: [Object] })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Server not found' })
    public async getServerInvites(
        @Path('serverId') serverId: string,
    ): Promise<unknown[]> {
        const server = await this.serverRepo.findById(serverId, true);
        if (server === null) {
            throw new NotFoundException(ErrorMessages.SERVER.NOT_FOUND);
        }

        const invites = await this.inviteRepo.findByServerId(serverId);
        return invites.map((invite) => ({
            id: invite.snowflakeId,
            serverId: invite.serverId.toString(),
            code: invite.code,
            customPath: invite.customPath,
            createdByUserId: invite.createdByUserId.toString(),
            maxUses: invite.maxUses,
            uses: invite.uses,
            expiresAt: invite.expiresAt,
            createdAt: invite.createdAt,
        }));
    }

    @Delete('servers/:serverId/invites/:inviteId')
    @Permissions('manageServer')
    @ApiOperation({ summary: 'Delete a server invite (Admin access)' })
    @ApiOkResponse({
        type: AdminSimpleMessageResponseDTO,
        description: 'Invite deleted',
    })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Invite not found' })
    public async deleteServerInvite(
        @Path('serverId') serverId: string,
        @Path('inviteId') inviteId: string,
        @Request() req: AuthenticatedRequest,
    ): Promise<{ message: string }> {
        const invite = await this.inviteRepo.findById(inviteId);
        if (invite === null || invite.serverId !== serverId) {
            throw new NotFoundException('Invite not found for this server');
        }

        await this.inviteRepo.delete(inviteId);
        await this.discoveryService.refreshServer(serverId);

        await this.logAdminAction(
            req,
            'delete_server_invite',
            invite.createdByUserId.toString(),
            { serverId, inviteCode: invite.code },
        );

        return { message: 'Invite deleted' };
    }

    @Delete('servers/:serverId/verification')
    @Permissions('manageServer')
    @ApiOperation({ summary: 'Decline server verification application' })
    @ApiOkResponse({
        type: AdminSimpleMessageResponseDTO,
        description: 'Verification declined',
    })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Server not found' })
    public async declineVerification(
        @Path('serverId') serverId: string,
        @Request() req: AuthenticatedRequest,
    ): Promise<{ message: string }> {
        const server = await this.serverRepo.findById(serverId, true);
        if (server === null || server.verificationRequested !== true) {
            throw new NotFoundException('Verification request not found.');
        }
        await this.serverRepo.update(serverId, {
            verificationRequested: false,
        });
        await this.discoveryService.refreshServer(serverId);
        await this.logAdminAction(
            req,
            'decline_server_verification',
            server.ownerId.toString(),
            {
                serverId,
                serverName: server.name,
            },
        );
        return { message: 'Verification application declined.' };
    }

    @Put('servers/:serverId/verification-override')
    @Permissions('manageServer')
    @ApiOperation({
        summary: 'Set or clear a manual server verification override',
    })
    @ApiOkResponse({ type: AdminServerVerificationOverrideResponseDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Server not found' })
    public async setServerVerificationOverride(
        @Path('serverId') serverId: string,
        @Body() body: AdminServerVerificationOverrideRequestDTO,
        @Request() req: AuthenticatedRequest,
    ): Promise<{
        verified: boolean;
        override: 'verified' | 'unverified' | null;
    }> {
        const server = await this.serverRepo.findById(serverId, true);
        if (server === null) {
            throw new NotFoundException(ErrorMessages.SERVER.NOT_FOUND);
        }

        const override = body.override ?? null;
        const verified =
            override === 'verified'
                ? true
                : override === 'unverified'
                  ? false
                  : (server.verified ?? false);

        await this.serverRepo.update(serverId, {
            verified,
            verificationOverride: override,
            verificationRequested:
                override === null
                    ? (server.verificationRequested ?? false)
                    : false,
        });
        await this.discoveryService.refreshServer(serverId);
        await this.logAdminAction(
            req,
            'set_server_verification_override',
            server.ownerId.toString(),
            {
                serverId,
                serverName: server.name,
                content: override ?? 'cleared',
            },
        );

        return { verified, override };
    }

    @Post('servers/:serverId/verify')
    @HttpCode(200)
    @Permissions('manageServer')
    @ApiOperation({ summary: 'Grant a server the verified badge' })
    @ApiOkResponse({ type: AdminServerVerifyResponseDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Server not found' })
    public async verifyServer(
        @Path('serverId') serverId: string,
        @Request() req: AuthenticatedRequest,
    ): Promise<{ verified: boolean }> {
        const server = await this.serverRepo.findById(serverId, true);
        if (server === null) {
            throw new NotFoundException(ErrorMessages.SERVER.NOT_FOUND);
        }

        if (server.verificationRequested !== true) {
            throw new BadRequestException(
                'Verification has not been requested for this server.',
            );
        }
        await this.serverRepo.update(serverId, {
            verified: true,
            verificationOverride: 'verified',
            verificationRequested: false,
        });
        await this.discoveryService.refreshServer(serverId);
        await this.logAdminAction(
            req,
            'verify_server',
            server.ownerId.toString(),
            {
                serverId,
                serverName: server.name,
            },
        );
        return { verified: true };
    }

    @Delete('servers/:serverId/verify')
    @Permissions('manageServer')
    @ApiOperation({ summary: 'Remove the verified badge from a server' })
    @ApiOkResponse({ type: AdminServerVerifyResponseDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Server not found' })
    public async unverifyServer(
        @Path('serverId') serverId: string,
        @Request() req: AuthenticatedRequest,
    ): Promise<{ verified: boolean }> {
        const server = await this.serverRepo.findById(serverId, true);
        if (server === null) {
            throw new NotFoundException(ErrorMessages.SERVER.NOT_FOUND);
        }
        await this.serverRepo.update(serverId, {
            verified: false,
            verificationOverride: 'unverified',
        });
        await this.discoveryService.refreshServer(serverId);
        await this.logAdminAction(
            req,
            'unverify_server',
            server.ownerId.toString(),
            {
                serverId,
                serverName: server.name,
            },
        );
        return { verified: false };
    }

    private mapAdminInfo(
        id: string,
        userRef?: {
            username?: string;
            displayName?: string | null;
            profilePicture?: string;
        },
    ): AdminNoteAdminInfoDTO {
        return {
            id,
            username: userRef?.username ?? '',
            displayName: userRef?.displayName ?? undefined,
            profilePicture:
                userRef?.profilePicture !== undefined &&
                userRef.profilePicture !== ''
                    ? `/api/v1/profile/picture/${userRef.profilePicture}`
                    : undefined,
        };
    }

    private mapAdminNote(note: IAdminNote): AdminNoteResponseDTO {
        return {
            id: note.snowflakeId,
            targetId: note.targetId.toString(),
            targetType: note.targetType,
            adminId: this.mapAdminInfo(note.adminId, note.adminIdUser),
            content: note.content,
            history: note.history.map((h: IAdminNoteHistory) => ({
                content: h.content,
                editorId: this.mapAdminInfo(h.editorId, h.editorIdUser),
                editedAt: h.editedAt,
            })),
            deletedAt: note.deletedAt,
            deletedBy:
                note.deletedBy !== undefined
                    ? this.mapAdminInfo(note.deletedBy, note.deletedByUser)
                    : undefined,
            deleteReason: note.deleteReason,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
        };
    }

    @Get('servers/:serverId/notes')
    @Permissions('manageServer')
    @ApiOperation({ summary: 'Get all notes for a specific server' })
    @ApiResponse({ status: 200, type: [AdminNoteResponseDTO] })
    public async getServerNotes(
        @Path('serverId') serverId: string,
    ): Promise<AdminNoteResponseDTO[]> {
        const notes = await this.adminNoteRepo.findByTarget(serverId, 'Server');
        return notes.map((n) => this.mapAdminNote(n));
    }

    @Post('servers/:serverId/notes')
    @Permissions('manageServer')
    @ApiOperation({ summary: 'Create a new note for a server' })
    @ApiResponse({ status: 201, type: AdminNoteResponseDTO })
    public async createServerNote(
        @Path('serverId') serverId: string,
        @Request() req: AuthenticatedRequest,
        @Body() body: CreateAdminNoteRequestDTO,
    ): Promise<AdminNoteResponseDTO> {
        const note = await this.adminNoteRepo.create({
            targetId: serverId,
            targetType: 'Server',
            adminId: req.user.id,
            content: body.content,
        });

        await this.logAdminAction(
            req,
            'create_admin_note',
            undefined,
            {
                noteId: note.snowflakeId,
                targetId: serverId,
                targetType: 'Server',
                content: body.content,
            },
            serverId,
            'server',
            serverId,
        );

        const found = await this.adminNoteRepo.findById(note.snowflakeId);
        if (found === null) {
            throw new NotFoundException('Note not found');
        }
        return this.mapAdminNote(found);
    }

    @Get('users/:userId/notes')
    @Permissions('manageUsers')
    @ApiOperation({ summary: 'Get all notes for a specific user' })
    @ApiResponse({ status: 200, type: [AdminNoteResponseDTO] })
    public async getUserNotes(
        @Path('userId') userId: string,
    ): Promise<AdminNoteResponseDTO[]> {
        const notes = await this.adminNoteRepo.findByTarget(userId, 'User');
        return notes.map((n) => this.mapAdminNote(n));
    }

    @Post('users/:userId/notes')
    @Permissions('manageUsers')
    @ApiOperation({ summary: 'Create a new note for a user' })
    @ApiResponse({ status: 201, type: AdminNoteResponseDTO })
    public async createUserNote(
        @Path('userId') userId: string,
        @Request() req: AuthenticatedRequest,
        @Body() body: CreateAdminNoteRequestDTO,
    ): Promise<AdminNoteResponseDTO> {
        const note = await this.adminNoteRepo.create({
            targetId: userId,
            targetType: 'User',
            adminId: req.user.id,
            content: body.content,
        });

        await this.logAdminAction(
            req,
            'create_admin_note',
            userId,
            {
                noteId: note.snowflakeId,
                targetId: userId,
                targetType: 'User',
                content: body.content,
            },
            userId,
            'user',
        );

        const found = await this.adminNoteRepo.findById(note.snowflakeId);
        if (found === null) throw new NotFoundException('Note not found');
        return this.mapAdminNote(found);
    }

    @Put('notes/:noteId')
    @Permissions('manageUsers')
    @ApiOperation({ summary: 'Update an existing admin note' })
    @ApiResponse({ status: 200, type: AdminNoteResponseDTO })
    public async updateNote(
        @Path('noteId') noteId: string,
        @Request() req: AuthenticatedRequest,
        @Body() body: UpdateAdminNoteRequestDTO,
    ): Promise<AdminNoteResponseDTO> {
        const updated = await this.adminNoteRepo.update(
            noteId,
            req.user.id,
            body.content,
        );
        if (updated === null) {
            throw new NotFoundException('Note not found or already deleted');
        }

        await this.logAdminAction(
            req,
            'update_admin_note',
            undefined,
            {
                noteId,
                content: body.content,
            },
            noteId,
            updated.targetType.toLowerCase(),
        );

        return this.mapAdminNote(updated);
    }

    @Delete('notes/:noteId')
    @Permissions('manageUsers')
    @ApiOperation({ summary: 'Soft-delete a note with a reason' })
    @ApiResponse({ status: 200, type: AdminNoteResponseDTO })
    public async deleteNote(
        @Path('noteId') noteId: string,
        @Request() req: AuthenticatedRequest,
        @Body() body: SoftDeleteAdminNoteRequestDTO,
    ): Promise<AdminNoteResponseDTO> {
        const deleted = await this.adminNoteRepo.softDelete({
            id: noteId,
            deletedBy: req.user.id,
            deleteReason: body.reason,
        });
        if (deleted === null) {
            throw new NotFoundException('Note not found');
        }

        await this.logAdminAction(
            req,
            'delete_admin_note',
            undefined,
            {
                noteId,
                reason: body.reason,
            },
            noteId,
            deleted.targetType.toLowerCase(),
        );

        return this.mapAdminNote(deleted);
    }
}
