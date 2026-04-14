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
    ApiOperation,
    ApiBearerAuth,
} from '@nestjs/swagger';
import { TYPES } from '@/di/types';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type { IAuditLogRepository } from '@/di/interfaces/IAuditLogRepository';
import type { IFriendshipRepository } from '@/di/interfaces/IFriendshipRepository';
import type { IBanRepository } from '@/di/interfaces/IBanRepository';
import type { IServerRepository, IServer } from '@/di/interfaces/IServerRepository';
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
import { Ban } from '@/models/Ban';
import { ServerBan } from '@/models/Server';
import { IAdminNote, IAdminNoteHistory } from '@/models/AdminNote';
import mongoose, { Types } from 'mongoose';
import {
    generateAnonymizedUsername,
    DELETED_AVATAR_PATH,
    deleteAvatarFile,
} from '@/utils/deletion';
import { DashBoardStatsDTO } from './dto/admin-dashboard-stats.response.dto';
import { AdminPermissions, ProfileFieldDTO } from './dto/common.request.dto';
import {
    AdminUserListItemDTO,
    AdminUserDetailsDTO,
    AdminExtendedUserDetailsDTO,
    AdminUserShortDTO,
} from './dto/admin-users.response.dto';
import {
    AdminResetProfileRequestDTO,
    AdminSoftDeleteUserRequestDTO,
    AdminUpdateUserPermissionsRequestDTO,
    AdminBanUserRequestDTO,
    AdminWarnUserRequestDTO,
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
} from './dto/admin-user-actions.response.dto';
import {
    AdminUserBanHistoryResponseDTO,
    AdminBanListResponseDTO,
    AdminBansDiagnosticResponseDTO,
    AdminBanHistoryItemDTO,
} from './dto/admin-bans.response.dto';
import {
    AdminUserWarningsResponseDTO,
    AdminWarningListResponseDTO,
} from './dto/admin-warnings.response.dto';
import { AdminAuditLogListResponseDTO } from './dto/admin-audit-logs.response.dto';
import { AdminListAuditLogsRequestDTO } from './dto/admin-audit-logs.request.dto';
import {
    AdminServerListResponseDTO,
    AdminDeleteServerResponseDTO,
    AdminRestoreServerResponseDTO,
    AdminServerListItemDTO,
} from './dto/admin-servers.response.dto';
import {
    AdminServerDetailsDTO,
    AdminChannelShortDTO,
} from './dto/admin-servers-details.response.dto';
import {
    CreateAdminNoteRequestDTO,
    UpdateAdminNoteRequestDTO,
    SoftDeleteAdminNoteRequestDTO,
    AdminNoteResponseDTO,
} from './dto/admin-notes.dto';
import { AdminListUsersRequestDTO } from './dto/admin-list-users.request.dto';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { Permissions } from '@/modules/auth/permissions.decorator';

import { injectable } from 'inversify';
import { AuthenticatedRequest } from '@/middleware/auth';

// Controller for administrative actions and dashboard statistics
@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@injectable()
@Controller('api/v1/admin')
export class AdminController {
    constructor(
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
                const dmVal = dmSparkline[dmSparkline.length - 1 - i] || 0;
                const smVal =
                    serverMsgSparkline[serverMsgSparkline.length - 1 - i] || 0;
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
        // Build query options based on query parameters
        const options: Record<string, unknown> = {
            limit: Number(query.limit ?? 50),
            offset: Number(query.offset ?? 0),
            includeDeleted: query.includeDeleted === true,
        };
        if (query.search) options.search = query.search;
        if (query.filter) options.filter = query.filter;

        const users = await this.userRepo.findMany(options);

        // Enriched users include ban status and warning counts
        const enrichedUsers = await Promise.all(
            users.map(async (user) => {
                const activeBan = await this.banRepo.findActiveByUserId(
                    user._id,
                );
                const warningCount = await this.warningRepo.countByUserId(
                    user._id,
                );
                const item = new AdminUserListItemDTO();
                item._id = user._id.toString();
                item.username = user.username || '';
                item.login = user.login || '';
                item.displayName = user.displayName || null;
                item.profilePicture = user.profilePicture || null;
                item.permissions =
                    (user.permissions as unknown as AdminPermissions) || '0';
                item.createdAt = user.createdAt || new Date();
                item.banExpiry = activeBan?.expirationTimestamp;
                item.warningCount = warningCount;
                item.badges = user.badges || [];
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
        const users = await this.userRepo.findMany({
            filter: 'admin',
            limit: 1000,
        });

        return users.map((user) => {
            const dto = new AdminUserShortDTO();
            dto._id = user._id.toString();
            dto.username = user.username || '';
            dto.displayName = user.displayName || null;
            return dto;
        });
    }

    @Get('users/:userId')
    @Permissions('viewUsers')
    @ApiOperation({
        summary: 'Retrieve detailed information about a specific user',
    })
    @ApiResponse({ status: 200, type: AdminUserDetailsDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'User not found' })
    public async getUserDetails(
        @Path('userId') userId: string,
        @Request() req: AuthenticatedRequest,
    ): Promise<AdminUserDetailsDTO> {
        const userOid = new Types.ObjectId(userId);
        const user = await this.userRepo.findById(userOid);
        if (!user) {
            this.logger.warn(
                `Admin ${req.user.login} tried to view non-existent user ${userId}`,
            );
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        this.logger.info(
            `Admin ${req.user.login} viewed user details for ${userId}`,
        );
        const activeBan = await this.banRepo.findActiveByUserId(userOid);
        const warningCount = await this.warningRepo.countByUserId(userOid);

        let badges: unknown[] = [];
        if (user.badges && user.badges.length > 0) {
            badges = await Badge.find({ id: { $in: user.badges } }).lean();
        }

        const details = new AdminUserDetailsDTO();
        details._id = user._id.toString();
        details.username = user.username || '';
        details.login = user.login || '';
        details.displayName = user.displayName || null;
        details.profilePicture = user.profilePicture || null;
        details.permissions =
            (user.permissions as unknown as AdminPermissions) || '0';
        details.createdAt = user.createdAt || new Date();
        details.banExpiry = activeBan?.expirationTimestamp;
        details.warningCount = warningCount;
        details.bio = user.bio || '';
        details.pronouns = user.pronouns || '';
        details.badges = badges as string[];
        details.banner = user.banner
            ? `/api/v1/profile/banner/${user.banner}`
            : null;
        details.deletedAt = user.deletedAt;
        details.deletedReason = user.deletedReason;
        return details;
    }

    // Resets specific profile fields for a user
    // Resetting the username forces a logout and requires the user to log in again
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
        const userOid = new Types.ObjectId(userId);
        const user = await this.userRepo.findById(userOid);
        if (!user) {
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        const updateData: Record<string, unknown> = {};
        const oldUsername = user.username || '';
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

        await this.userRepo.update(userOid, updateData);

        await this.logAdminAction(req, 'reset_user_profile', userId, {
            fields,
        });

        if (usernameChanged) {
            try {
                const updatedUser = await this.userRepo.findById(userOid);

                const event: IUserUpdatedEvent = {
                    type: 'user_updated',
                    payload: {
                        userId,
                        oldUsername,
                        newUsername: updateData.username as string,
                        profilePicture: updatedUser?.profilePicture
                            ? `/api/v1/profile/picture/${updatedUser.profilePicture}`
                            : null,
                        usernameFont: updatedUser?.usernameFont,
                        usernameGradient: updatedUser?.usernameGradient,
                        usernameGlow: updatedUser?.usernameGlow,
                    },
                };
                this.wsServer.broadcastToAll(event);

                const sockets = this.wsServer.getUserSockets(userId);
                if (sockets && sockets.length > 0) {
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

    // Helper method to log admin actions to audit log
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
            if (additionalData) {
                if (additionalData.reason)
                    safeData.reason = additionalData.reason;
                if (additionalData.duration)
                    safeData.duration = additionalData.duration;
                if (additionalData.count) safeData.count = additionalData.count;
                if (additionalData.serverId)
                    safeData.serverId = additionalData.serverId;
                if (additionalData.serverName)
                    safeData.serverName = additionalData.serverName;
                if (additionalData.fields)
                    safeData.fields = additionalData.fields;
                if (additionalData.noteId) safeData.noteId = additionalData.noteId;
                if (additionalData.content) 
                    safeData.content = typeof additionalData.content === 'string' 
                        ? additionalData.content.substring(0, 100) 
                        : additionalData.content;
            }

            const actorId = req.user.id;

            if (!actorId) {
                throw new ForbiddenException(ErrorMessages.AUTH.UNAUTHORIZED);
            }

            const auditData: {
                actorId: Types.ObjectId;
                actionType: string;
                additionalData: Record<string, unknown>;
                targetUserId?: Types.ObjectId;
                targetId?: Types.ObjectId;
                targetType?: string;
                serverId?: Types.ObjectId;
            } = {
                actorId: new Types.ObjectId(actorId),
                actionType,
                additionalData: safeData,
            };

            if (targetUserId) {
                auditData.targetUserId = new Types.ObjectId(targetUserId);
            }

            if (targetId) {
                auditData.targetId = new Types.ObjectId(targetId);
            }

            if (targetType) {
                auditData.targetType = targetType.toLowerCase();
            }

            if (serverId) {
                auditData.serverId = new Types.ObjectId(serverId);
            }

            await this.auditLogRepo.create(auditData as any); // eslint-disable-line @typescript-eslint/no-explicit-any
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
        const userOid = new Types.ObjectId(userId);

        const user = await this.userRepo.findById(userOid);
        if (!user) {
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        if (user.deletedAt) {
            throw new BadRequestException(
                ErrorMessages.AUTH.USER_ALREADY_DELETED,
            );
        }

        const oldUsername = user.username || '';
        const oldAvatar = user.profilePicture;

        const anonymizedUsername =
            user.anonymizedUsername || generateAnonymizedUsername(userId);

        await this.userRepo.update(userOid, {
            deletedAt: new Date(),
            deletedReason: reason,
            profilePicture: DELETED_AVATAR_PATH,
            login: `deleted_${userId}`,
            anonymizedUsername,
            tokenVersion: (user.tokenVersion || 0) + 1,
        });

        if (oldAvatar) {
            await deleteAvatarFile(oldAvatar);
        }

        await this.friendshipRepo.deleteAllRequestsForUser(userOid);

        await this.logAdminAction(req, 'soft_delete_user', userId, {
            reason,
        });

        const friendships = await this.friendshipRepo.findAllByUserId(userOid);
        const offlineFriends: string[] = [];

        const event: IUserUpdatedEvent = {
            type: 'user_updated',
            payload: {
                userId: user._id.toString(),
                oldUsername,
                newUsername: anonymizedUsername,
                profilePicture: DELETED_AVATAR_PATH,
            },
        };

        for (const friendship of friendships) {
            const friendUsername =
                friendship.userId?.toString() === userId
                    ? friendship.friend
                    : friendship.user;

            const friendUser = await this.userRepo.findByUsername(
                friendUsername || '',
            );
            if (friendUser) {
                const friendUserId = friendUser._id.toString();
                if (await this.wsServer.isUserOnline(friendUserId)) {
                    this.wsServer.broadcastToUser(friendUserId, event);
                } else {
                    offlineFriends.push(friendUserId);
                }
            }
        }

        const deletedUserSockets = this.wsServer.getUserSockets(userId);
        if (deletedUserSockets && deletedUserSockets.length > 0) {
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
            const userOid = new Types.ObjectId(userId);

            const user = await this.userRepo.findById(userOid);
            if (!user) {
                await session.abortTransaction();
                throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
            }

            const username = user.username || '';
            const oldAvatar = user.profilePicture;

            const sentMessagesUpdated =
                await this.messageRepo.updateManyBySenderId(userOid, {
                    senderDeleted: true,
                    anonymizedSender: 'Deleted User',
                });

            const receivedMessagesUpdated =
                await this.messageRepo.updateManyByReceiverId(userOid, {
                    receiverDeleted: true,
                    anonymizedReceiver: 'Deleted User',
                });

            const friendships =
                await this.friendshipRepo.findAllByUserId(userOid);

            await this.friendshipRepo.deleteAllForUser(userOid);
            await this.friendshipRepo.deleteAllRequestsForUser(userOid);
            await this.warningRepo.deleteAllForUser(userOid);
            await this.banRepo.deleteAllForUser(userOid);
            await this.userRepo.incrementTokenVersion(userOid);

            if (oldAvatar && oldAvatar !== DELETED_AVATAR_PATH) {
                await deleteAvatarFile(oldAvatar);
            }

            await this.userRepo.hardDelete(userOid);

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
                    friendship.userId?.toString() === userId
                        ? friendship.friend
                        : friendship.user;

                const friendUser = await this.userRepo.findByUsername(
                    friendUsername || '',
                );
                if (friendUser) {
                    const friendUserId = friendUser._id.toString();
                    if (await this.wsServer.isUserOnline(friendUserId)) {
                        this.wsServer.broadcastToUser(friendUserId, event);
                    } else {
                        offlineFriends.push(friendUserId);
                    }
                }
            }

            const deletedUserSockets = this.wsServer.getUserSockets(userId);
            if (deletedUserSockets && deletedUserSockets.length > 0) {
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
            session.endSession();
        }
    }

    // Updates a user's permissions
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
        const userOid = new Types.ObjectId(userId);

        const user = await this.userRepo.findById(userOid);
        if (!user) {
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        if (userId === req.user.id) {
            throw new BadRequestException('Cannot modify your own permissions');
        }

        await this.userRepo.updatePermissions(userOid, permissions);
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
        const userOid = new Types.ObjectId(userId);

        const targetUser = await this.userRepo.findById(userOid);
        if (!targetUser) {
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        const expirationTimestamp = new Date(Date.now() + duration * 60 * 1000);
        const issuedByIdStr = req.user.id;
        const issuedBy = issuedByIdStr
            ? new Types.ObjectId(issuedByIdStr)
            : undefined;

        if (!issuedBy) {
            throw new ForbiddenException(ErrorMessages.AUTH.UNAUTHORIZED);
        }

        const ban = await this.banRepo.createOrUpdateWithHistory({
            userId: userOid,
            reason: reason.trim(),
            issuedBy,
            expirationTimestamp,
        });

        await this.logAdminAction(req, 'ban_user', userId, {
            reason: reason.trim(),
            duration,
        });

        const serverMemberships =
            await this.serverMemberRepo.findAllByUserId(userOid);

        for (const membership of serverMemberships) {
            await this.serverMemberRepo.deleteById(membership._id);

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
        if (sockets && sockets.length > 0) {
            sockets.forEach((ws) => {
                this.wsServer.closeConnection(
                    ws,
                    1008,
                    `Banned: ${reason.trim()}`,
                );
            });
        }

        const response = new AdminBanUserResponseDTO();
        response._id = ban._id.toString();
        response.userId = ban.userId.toString();
        response.reason = ban.reason || '';
        response.issuedBy = ban.issuedBy?.toString() || 'unknown';
        response.expirationTimestamp = ban.expirationTimestamp || new Date();
        response.active = ban.active || false;
        response.history = ban.history || [];
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
        const userOid = new Types.ObjectId(userId);
        await this.banRepo.deactivateAllForUser(userOid);
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
        const userOid = new Types.ObjectId(userId);
        const ban = await this.banRepo.findByUserIdWithHistory(userOid);
        if (!ban || !ban.history || ban.history.length === 0) {
            return [];
        }

        const getIsActive = (index: number) =>
            index === (ban.history as unknown[]).length - 1 &&
            (ban.active || false);

        const historyWithStatus: AdminUserBanHistoryResponseDTO =
            ban.history.map((entry, index: number) => {
                const item = new AdminBanHistoryItemDTO();
                const e = entry as Record<string, unknown>;
                item._id = String(e._id || '');
                item.reason = String(e.reason || '');
                item.timestamp = (e.timestamp as Date) || new Date();
                item.expirationTimestamp =
                    (e.expirationTimestamp as Date) || new Date();
                item.issuedBy = String(e.issuedBy || 'unknown');
                item.active = getIsActive(index);
                return item;
            });
        return historyWithStatus;
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
        const bans = await this.banRepo.findAll({
            limit: Number(limit),
            offset: Number(offset),
        });
        return bans;
    }

    @Get('bans/diagnostic')
    @Permissions('viewBans')
    @ApiOperation({ summary: 'Diagnostic endpoint for ban collections' })
    @ApiResponse({ status: 200, type: AdminBansDiagnosticResponseDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async getBansDiagnostic(): Promise<AdminBansDiagnosticResponseDTO> {
        const appBansCount = await Ban.countDocuments();
        const appBansSample = await Ban.find({}).limit(5).lean();

        const serverBansCount = await ServerBan.countDocuments();
        const serverBansSample = await ServerBan.find({}).limit(5).lean();

        const response = new AdminBansDiagnosticResponseDTO();
        response.appBans = {
            count: appBansCount,
            sample: appBansSample as unknown[],
        };
        response.serverBans = {
            count: serverBansCount,
            sample: serverBansSample as unknown[],
        };
        return response;
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
        const userOid = new Types.ObjectId(userId);
        const issuedByIdStr = req.user.id;
        if (!issuedByIdStr) {
            throw new ForbiddenException(ErrorMessages.AUTH.UNAUTHORIZED);
        }

        const warning = await this.warningRepo.create({
            userId: userOid,
            issuedBy: new Types.ObjectId(issuedByIdStr),
            message,
        });

        await this.logAdminAction(req, 'warn_user', userId, {
            reason: message,
        });

        const user = await this.userRepo.findById(userOid);
        if (user && (await this.wsServer.isUserOnline(userOid.toString()))) {
            const event: IWarningEvent = {
                type: 'warning',
                payload: {
                    _id: warning._id.toString(),
                    userId: warning.userId.toString(),
                    issuedBy: warning.issuedBy.toString(),
                    message: warning.message,
                    timestamp: warning.timestamp,
                    acknowledged: warning.acknowledged,
                    acknowledgedAt: warning.acknowledgedAt,
                },
            };
            this.wsServer.broadcastToUser(userOid.toString(), event);
        }

        const response = new AdminWarnUserResponseDTO();
        response._id = warning._id.toString();
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
        const userOid = new Types.ObjectId(userId);
        const warnings = await this.warningRepo.findByUserId(userOid);
        return warnings.map((w) => {
            const dto = new AdminWarnUserResponseDTO();
            dto._id = w._id.toString();
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
        const warnings = await this.warningRepo.findAll({
            limit: Number(limit),
            offset: Number(offset),
        });
        return warnings.map((w) => {
            const dto = new AdminWarnUserResponseDTO();
            dto._id = w._id.toString();
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
        const logs = await this.auditLogRepo.find({
            serverId: null,
            limit: Number(query.limit ?? 100),
            offset: Number(query.offset ?? 0),
            actorId: query.actorId
                ? new Types.ObjectId(query.actorId)
                : undefined,
            actionType: query.actionType,
            targetUserId: query.targetUserId
                ? new Types.ObjectId(query.targetUserId)
                : undefined,
            startDate: query.startDate ? new Date(query.startDate) : undefined,
            endDate: query.endDate ? new Date(query.endDate) : undefined,
        });
        return logs;
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
        const servers = await this.serverRepo.findMany({
            limit: Number(limit),
            offset: Number(offset),
            search: search as string,
            includeDeleted: true,
        });

        const ownerIds = [...new Set(servers.map((s) => s.ownerId))].filter(
            (id) => mongoose.Types.ObjectId.isValid(id.toString()),
        );
        const owners = await this.userRepo.findByIds(ownerIds);

        const enrichedServers = await Promise.all(
            servers.map(async (server) => {
                const owner = owners.find((u) => u._id.equals(server.ownerId));
                const memberCount = await this.serverMemberRepo.countByServerId(
                    server._id,
                );
                const item = new AdminServerListItemDTO();
                const enrichedServer = server as IServer & { realMessageCount?: number; weightScore?: number };
                
                item._id = server._id.toString();
                item.name = server.name;
                item.icon = server.icon ? `${server.icon}` : null;
                item.banner = server.banner;
                item.ownerId = server.ownerId.toString();
                item.memberCount = memberCount;
                item.createdAt = server.createdAt || new Date();
                item.deletedAt = server.deletedAt;
                item.verified = server.verified ?? false;
                item.verificationRequested = server.verificationRequested ?? false;
                item.realMessageCount = enrichedServer.realMessageCount;
                item.weightScore = enrichedServer.weightScore;
                if (owner) {
                    item.owner = {
                        _id: owner._id.toString(),
                        username: owner.username || '',
                        displayName: owner.displayName || null,
                        profilePicture: owner.profilePicture
                            ? `/api/v1/profile/picture/${owner.profilePicture}`
                            : null,
                    };
                }
                return item;
            }),
        );

        return enrichedServers;
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
        const serverOid = new Types.ObjectId(serverId);
        const server = await this.serverRepo.findById(serverOid, true);
        if (!server) {
            throw new NotFoundException(ErrorMessages.SERVER.NOT_FOUND);
        }

        await this.serverRepo.softDelete(serverOid);

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
        const serverOid = new Types.ObjectId(serverId);
        const server = await this.serverRepo.findById(serverOid, true);

        if (!server) {
            throw new NotFoundException(ErrorMessages.SERVER.NOT_FOUND);
        }

        if (!server.deletedAt) {
            throw new BadRequestException(ErrorMessages.SERVER.NOT_DELETED);
        }

        await this.serverRepo.restore(serverOid);

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
        const userOid = new Types.ObjectId(userId);
        const user = await this.userRepo.findById(userOid);
        if (!user) {
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        const profilePictureUrl = user.deletedAt
            ? '/images/deleted-cat.jpg'
            : user.profilePicture
              ? `/api/v1/profile/picture/${user.profilePicture}`
              : null;

        const memberships = await this.serverMemberRepo.findByUserId(userOid);
        const serverIds = memberships.map((m) => m.serverId);
        const servers = await this.serverRepo.findByIds(serverIds);

        const serverList = await Promise.all(
            servers.map(async (server) => {
                const membership = memberships.find((m) =>
                    m.serverId.equals(server._id),
                );
                const memberCount = await this.serverMemberRepo.countByServerId(
                    server._id,
                );
                return {
                    _id: server._id.toString(),
                    name: server.name,
                    icon: server.icon || null,
                    banner: server.banner?.value || null,
                    ownerId: server.ownerId.toString(),
                    memberCount,
                    joinedAt: membership?.joinedAt,
                    isOwner: server.ownerId.equals(userOid),
                };
            }),
        );

        const activeBan = await this.banRepo.findActiveByUserId(userOid);
        const warningCount = await this.warningRepo.countByUserId(userOid);

        let badges: unknown[] = [];
        if (user.badges && user.badges.length > 0) {
            badges = await Badge.find({ id: { $in: user.badges } }).lean();
        }

        const response = new AdminExtendedUserDetailsDTO();
        response._id = user._id.toString();
        response.username = user.username || '';
        response.login = user.login || '';
        response.displayName = user.displayName || null;
        response.profilePicture = profilePictureUrl;
        response.permissions = user.permissions || '0';
        response.createdAt = user.createdAt || new Date();
        response.banExpiry = activeBan?.expirationTimestamp;
        response.warningCount = warningCount;
        response.bio = user.bio || '';
        response.pronouns = user.pronouns || '';
        response.badges = badges as string[];
        response.banner = user.banner
            ? `/api/v1/profile/banner/${user.banner}`
            : null;
        response.deletedAt = user.deletedAt;
        response.deletedReason = user.deletedReason;
        response.servers = serverList;

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
        const servers = await this.serverRepo.listAwaitingReview({
            limit: Number(limit),
            offset: Number(offset)
        });

        const total = await this.serverRepo.countAwaitingReview();

        const ownerIds = [...new Set(servers.map((s) => s.ownerId))].filter(
            (id) => mongoose.Types.ObjectId.isValid(id.toString()),
        );
        const owners = await this.userRepo.findByIds(ownerIds);

        const items = servers.map((server) => {
            const owner = owners.find((u) => u._id.equals(server.ownerId));
            const item = new AdminServerListItemDTO();
            item._id = server._id.toString();
            item.name = server.name;
            item.icon = server.icon ? `${server.icon}` : null;
            item.banner = server.banner;
            item.ownerId = server.ownerId.toString();
            item.memberCount = server.memberCount || 0;
            item.createdAt = server.createdAt || new Date();
            item.deletedAt = server.deletedAt;
            item.verified = server.verified ?? false;
            item.verificationRequested = server.verificationRequested ?? false;
            item.realMessageCount = server.realMessageCount || 0;
            item.weightScore = server.weightScore || 0;

            if (owner) {
                item.owner = {
                    _id: owner._id.toString(),
                    username: owner.username || '',
                    displayName: owner.displayName || null,
                    profilePicture: owner.profilePicture
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
        const serverOid = new Types.ObjectId(serverId);
        const server = await this.serverRepo.findById(serverOid, true);
        if (!server) {
            throw new NotFoundException(ErrorMessages.SERVER.NOT_FOUND);
        }

        const owner = await this.userRepo.findById(server.ownerId);
        const memberCount = await this.serverMemberRepo.countByServerId(
            serverOid,
        );
        const messageVolume = await this.serverMessageRepo.countByServerId(
            serverOid,
        );
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [recentBanCount, recentKickCount] = await Promise.all([
            this.auditLogRepo.count({
                serverId: serverOid,
                actionType: 'user_ban',
                startDate: since,
            }),
            this.auditLogRepo.count({
                serverId: serverOid,
                actionType: 'user_kick',
                startDate: since,
            }),
        ]);
        const channels = await this.channelRepo.findByServerId(serverOid);

        const details = new AdminServerDetailsDTO();
        details._id = server._id.toString();
        details.name = server.name;
        details.icon = server.icon ? `${server.icon}` : null;
        details.banner = server.banner;
        details.ownerId = server.ownerId.toString();
        details.memberCount = memberCount;
        details.messageVolume = messageVolume;
        details.recentBanCount = recentBanCount;
        details.recentKickCount = recentKickCount;
        details.createdAt = server.createdAt || new Date();
        details.deletedAt = server.deletedAt;
        details.verified = server.verified ?? false;
        details.verificationRequested = server.verificationRequested ?? false;

        if (owner) {
            details.owner = {
                _id: owner._id.toString(),
                username: owner.username || '',
                displayName: owner.displayName || null,
                profilePicture: owner.profilePicture
                    ? `/api/v1/profile/picture/${owner.profilePicture}`
                    : null,
            };
        } else {
            details.owner = null;
        }

        details.channels = channels.map((c) => {
            const dto = new AdminChannelShortDTO();
            dto._id = c._id.toString();
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
        const serverOid = new Types.ObjectId(serverId);
        const server = await this.serverRepo.findById(serverOid, true);
        if (!server) {
            throw new NotFoundException(ErrorMessages.SERVER.NOT_FOUND);
        }

        const invites = await this.inviteRepo.findByServerId(serverOid);
        return invites.map((invite) => ({
            _id: invite._id.toString(),
            serverId: invite.serverId.toString(),
            code: invite.code,
            customPath: invite.customPath,
            createdByUserId: invite.createdByUserId?.toString() || '',
            maxUses: invite.maxUses,
            uses: invite.uses,
            expiresAt: invite.expiresAt,
            createdAt: invite.createdAt,
        }));
    }

    @Delete('servers/:serverId/invites/:inviteId')
    @Permissions('manageServer')
    @ApiOperation({ summary: 'Delete a server invite (Admin access)' })
    @ApiResponse({ status: 200 })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Invite not found' })
    public async deleteServerInvite(
        @Path('serverId') serverId: string,
        @Path('inviteId') inviteId: string,
        @Request() req: AuthenticatedRequest,
    ): Promise<{ message: string }> {
        const inviteOid = new Types.ObjectId(inviteId);
        const serverOid = new Types.ObjectId(serverId);

        const invite = await this.inviteRepo.findById(inviteOid);
        if (!invite || !invite.serverId.equals(serverOid)) {
            throw new NotFoundException('Invite not found for this server');
        }

        await this.inviteRepo.delete(inviteOid);

        await this.logAdminAction(
            req,
            'delete_server_invite',
            invite.createdByUserId?.toString(),
            { serverId, inviteCode: invite.code },
        );

        return { message: 'Invite deleted' };
    }


    @Delete('servers/:serverId/verification')
    @Permissions('manageServer')
    @ApiOperation({ summary: 'Decline server verification application' })
    @ApiResponse({ status: 200 })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Server not found' })
    public async declineVerification(
        @Path('serverId') serverId: string,
        @Request() req: AuthenticatedRequest,
    ): Promise<{ message: string }> {
        const serverOid = new Types.ObjectId(serverId);
        const server = await this.serverRepo.findById(serverOid, true);
        if (!server || !server.verificationRequested) {
            throw new NotFoundException('Verification request not found.');
        }
        await this.serverRepo.update(serverOid, { 
            verificationRequested: false
        });
        await this.logAdminAction(req, 'decline_server_verification', server.ownerId.toString(), {
            serverId,
            serverName: server.name,
        });
        return { message: 'Verification application declined.' };
    }

    @Post('servers/:serverId/verify')
    @HttpCode(200)
    @Permissions('manageServer')
    @ApiOperation({ summary: 'Grant a server the verified badge' })
    @ApiResponse({ status: 200 })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Server not found' })
    public async verifyServer(
        @Path('serverId') serverId: string,
        @Request() req: AuthenticatedRequest,
    ): Promise<{ verified: boolean }> {
        const serverOid = new Types.ObjectId(serverId);
        const server = await this.serverRepo.findById(serverOid, true);
        if (!server) {
            throw new NotFoundException(ErrorMessages.SERVER.NOT_FOUND);
        }

        if (!server.verificationRequested) {
            throw new BadRequestException('Verification has not been requested for this server.');
        }
        await this.serverRepo.update(serverOid, { 
            verified: true,
            verificationRequested: false
        });
        await this.logAdminAction(req, 'verify_server', server.ownerId.toString(), {
            serverId,
            serverName: server.name,
        });
        return { verified: true };
    }

    @Delete('servers/:serverId/verify')
    @Permissions('manageServer')
    @ApiOperation({ summary: 'Remove the verified badge from a server' })
    @ApiResponse({ status: 200 })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Server not found' })
    public async unverifyServer(
        @Path('serverId') serverId: string,
        @Request() req: AuthenticatedRequest,
    ): Promise<{ verified: boolean }> {
        const serverOid = new Types.ObjectId(serverId);
        const server = await this.serverRepo.findById(serverOid, true);
        if (!server) {
            throw new NotFoundException(ErrorMessages.SERVER.NOT_FOUND);
        }
        await this.serverRepo.update(serverOid, { verified: false });
        await this.logAdminAction(req, 'unverify_server', server.ownerId.toString(), {
            serverId,
            serverName: server.name,
        });
        return { verified: false };
    }

    private mapAdminInfo(admin: unknown): Record<string, unknown> | null {
        if (!admin) return null;
        const a = admin as { _id?: { toString(): string }; id?: string; username?: string; displayName?: string; profilePicture?: string };
        return {
            _id: (a._id || a.id)?.toString(),
            username: a.username,
            displayName: a.displayName || null,
            profilePicture: a.profilePicture
                ? `/api/v1/profile/picture/${a.profilePicture}`
                : null,
        };
    }

    private mapAdminNote(note: IAdminNote): Record<string, unknown> {
        return {
            _id: note._id.toString(),
            targetId: note.targetId.toString(),
            targetType: note.targetType,
            adminId: this.mapAdminInfo(note.adminId),
            content: note.content,
            history: (note.history || []).map((h: IAdminNoteHistory) => ({
                content: h.content,
                editorId: this.mapAdminInfo(h.editorId),
                editedAt: h.editedAt,
            })),
            deletedAt: note.deletedAt,
            deletedBy: this.mapAdminInfo(note.deletedBy),
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
        const notes = await this.adminNoteRepo.findByTarget(
            new Types.ObjectId(serverId),
            'Server',
        );
        return notes.map((n) =>
            this.mapAdminNote(n),
        ) as unknown as AdminNoteResponseDTO[];
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
            targetId: new Types.ObjectId(serverId),
            targetType: 'Server',
            adminId: new Types.ObjectId(req.user.id),
            content: body.content,
        });

        await this.logAdminAction(req, 'create_admin_note', undefined, {
            noteId: note._id.toString(),
            targetId: serverId,
            targetType: 'Server',
            content: body.content,
        }, serverId, 'server', serverId);

        const found = await this.adminNoteRepo.findById(note._id);
        if (!found) {
            throw new NotFoundException('Note not found');
        }
        return this.mapAdminNote(found) as unknown as AdminNoteResponseDTO;
    }

    @Get('users/:userId/notes')
    @Permissions('manageUsers')
    @ApiOperation({ summary: 'Get all notes for a specific user' })
    @ApiResponse({ status: 200, type: [AdminNoteResponseDTO] })
    public async getUserNotes(
        @Path('userId') userId: string,
    ): Promise<AdminNoteResponseDTO[]> {
        const notes = await this.adminNoteRepo.findByTarget(
            new Types.ObjectId(userId),
            'User',
        );
        return notes.map((n) =>
            this.mapAdminNote(n),
        ) as unknown as AdminNoteResponseDTO[];
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
            targetId: new Types.ObjectId(userId),
            targetType: 'User',
            adminId: new Types.ObjectId(req.user.id),
            content: body.content,
        });

        await this.logAdminAction(req, 'create_admin_note', userId, {
            noteId: note._id.toString(),
            targetId: userId,
            targetType: 'User',
            content: body.content,
        }, userId, 'user');

        const found = await this.adminNoteRepo.findById(note._id);
        if (!found) throw new NotFoundException('Note not found');
        return this.mapAdminNote(found) as unknown as AdminNoteResponseDTO;
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
            new Types.ObjectId(noteId),
            new Types.ObjectId(req.user.id),
            body.content,
        );
        if (!updated) {
            throw new NotFoundException(
                'Note not found or already deleted',
            );
        }

        await this.logAdminAction(req, 'update_admin_note', undefined, {
            noteId,
            content: body.content,
        }, noteId, updated.targetType.toLowerCase());

        return this.mapAdminNote(updated!) as unknown as AdminNoteResponseDTO;
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
            id: new Types.ObjectId(noteId),
            deletedBy: new Types.ObjectId(req.user.id),
            deleteReason: body.reason,
        });
        if (!deleted) {
            throw new NotFoundException('Note not found');
        }

        await this.logAdminAction(req, 'delete_admin_note', undefined, {
            noteId,
            reason: body.reason,
        }, noteId, deleted.targetType.toLowerCase());

        return this.mapAdminNote(deleted!) as unknown as AdminNoteResponseDTO;
    }
}
