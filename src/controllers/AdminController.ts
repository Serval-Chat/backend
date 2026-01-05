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
} from '@nestjs/common';
import { ApiTags, ApiResponse, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TYPES } from '@/di/types';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type { IAuditLogRepository } from '@/di/interfaces/IAuditLogRepository';
import type { IFriendshipRepository } from '@/di/interfaces/IFriendshipRepository';
import type { IBanRepository } from '@/di/interfaces/IBanRepository';
import type { IServerRepository } from '@/di/interfaces/IServerRepository';
import type { IMessageRepository } from '@/di/interfaces/IMessageRepository';
import type { IWarningRepository } from '@/di/interfaces/IWarningRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import { PresenceService } from '@/realtime/services/PresenceService';
import { ErrorMessages } from '@/constants/errorMessages';
import type { ILogger } from '@/di/interfaces/ILogger';
import crypto from 'crypto';
import { getIO } from '@/socket';
import { Badge } from '@/models/Badge';
import { Ban } from '@/models/Ban';
import { ServerBan } from '@/models/Server';
import mongoose from 'mongoose';
import {
    generateAnonymizedUsername,
    DELETED_AVATAR_PATH,
    deleteAvatarFile,
} from '@/utils/deletion';
import type { Request as ExpressRequest } from 'express';
import { DashBoardStatsDTO } from './dto/admin-dashboard-stats.response.dto';
import { JWTPayload } from '@/utils/jwt';
import { AdminPermissions, ProfileFieldDTO } from './dto/common.request.dto';
import {
    AdminUserListItemDTO,
    AdminUserDetailsDTO,
    AdminExtendedUserDetailsDTO,
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
import {
    AdminServerListResponseDTO,
    AdminDeleteServerResponseDTO,
    AdminRestoreServerResponseDTO,
    AdminServerListItemDTO,
} from './dto/admin-servers.response.dto';
import { AdminListUsersRequestDTO } from './dto/admin-list-users.request.dto';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { Permissions } from '@/modules/auth/permissions.decorator';

import { injectable, inject } from 'inversify';

// Controller for administrative actions and dashboard statistics
@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@injectable()
@Controller('api/v1/admin')
export class AdminController {
    constructor(
        @inject(TYPES.UserRepository)
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
        @inject(TYPES.AuditLogRepository)
        @Inject(TYPES.AuditLogRepository)
        private auditLogRepo: IAuditLogRepository,
        @inject(TYPES.FriendshipRepository)
        @Inject(TYPES.FriendshipRepository)
        private friendshipRepo: IFriendshipRepository,
        @inject(TYPES.PresenceService)
        @Inject(TYPES.PresenceService)
        private presenceService: PresenceService,
        @inject(TYPES.Logger)
        @Inject(TYPES.Logger)
        private logger: ILogger,
        @inject(TYPES.BanRepository)
        @Inject(TYPES.BanRepository)
        private banRepo: IBanRepository,
        @inject(TYPES.ServerRepository)
        @Inject(TYPES.ServerRepository)
        private serverRepo: IServerRepository,
        @inject(TYPES.MessageRepository)
        @Inject(TYPES.MessageRepository)
        private messageRepo: IMessageRepository,
        @inject(TYPES.WarningRepository)
        @Inject(TYPES.WarningRepository)
        private warningRepo: IWarningRepository,
        @inject(TYPES.ServerMemberRepository)
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
    ) { }


    @Get('stats')
    @Permissions('viewLogs')
    @ApiOperation({ summary: 'Retrieve high-level statistics for the admin dashboard' })
    @ApiResponse({ status: 200, type: DashBoardStatsDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async getStats(): Promise<DashBoardStatsDTO> {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const [users, bans, servers, messages] = await Promise.all([
            this.userRepo.count(),
            this.banRepo.countActive(),
            this.serverRepo.count(),
            this.messageRepo.count(),
        ]);

        const [newUsers, newBans, newServers, newMessages] = await Promise.all([
            this.userRepo.countCreatedAfter(oneDayAgo),
            this.banRepo.countCreatedAfter(oneDayAgo),
            this.serverRepo.countCreatedAfter(oneDayAgo),
            this.messageRepo.countCreatedAfter(oneDayAgo),
        ]);

        // Computes percent change between total and recent counts
        const calculateTrend = (current: number, recent: number) => {
            const previous = current - recent;
            if (previous === 0) return recent > 0 ? 100 : 0;
            return Math.round(((current - previous) / previous) * 100);
        };

        const activeUsersCount =
            this.presenceService.getAllOnlineUsers().length;

        const stats = new DashBoardStatsDTO();
        stats.users = users;
        stats.usersTrend = calculateTrend(users, newUsers);
        stats.activeUsers = activeUsersCount;
        stats.activeUsersTrend = 0;
        stats.bans = bans;
        stats.bansTrend = calculateTrend(bans, newBans);
        stats.servers = servers;
        stats.serversTrend = calculateTrend(servers, newServers);
        stats.messages = messages;
        stats.messagesTrend = calculateTrend(messages, newMessages);
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
                    user._id.toString(),
                );
                const warningCount = await this.warningRepo.countByUserId(
                    user._id.toString(),
                );
                const item = new AdminUserListItemDTO();
                item._id = user._id.toString();
                item.username = user.username || '';
                item.login = user.login || '';
                item.displayName = user.displayName || null;
                item.profilePicture = user.profilePicture || null;
                item.permissions = (user.permissions as unknown as AdminPermissions) || '0';
                item.createdAt = user.createdAt || new Date();
                item.banExpiry = activeBan?.expirationTimestamp;
                item.warningCount = warningCount;
                item.badges = user.badges || [];
                return item;
            }),
        );

        return enrichedUsers;
    }


    @Get('users/:userId')
    @Permissions('viewUsers')
    @ApiOperation({ summary: 'Retrieve detailed information about a specific user' })
    @ApiResponse({ status: 200, type: AdminUserDetailsDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'User not found' })
    public async getUserDetails(
        @Path('userId') userId: string,
        @Request() req: ExpressRequest,
    ): Promise<AdminUserDetailsDTO> {
        const user = await this.userRepo.findById(userId);
        if (!user) {
            this.logger.warn(
                `Admin ${(req as ExpressRequest & { user?: JWTPayload }).user?.login} tried to view non-existent user ${userId}`,
            );
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        this.logger.info(
            `Admin ${(req as ExpressRequest & { user?: JWTPayload }).user?.login} viewed user details for ${userId}`,
        );
        const activeBan = await this.banRepo.findActiveByUserId(userId);
        const warningCount = await this.warningRepo.countByUserId(userId);

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
        details.permissions = (user.permissions as unknown as AdminPermissions) || '0';
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
        @Request() req: ExpressRequest,
    ): Promise<AdminResetProfileResponseDTO> {
        const { fields } = requestBody;
        const user = await this.userRepo.findById(userId);
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
        if (fields.includes(ProfileFieldDTO.DISPLAY_NAME)) updateData.displayName = '';
        if (fields.includes(ProfileFieldDTO.PRONOUNS)) updateData.pronouns = '';
        if (fields.includes(ProfileFieldDTO.BIO)) updateData.bio = '';
        if (fields.includes(ProfileFieldDTO.BANNER)) updateData.banner = null;

        await this.userRepo.update(userId, updateData);

        await this.logAdminAction(req, 'reset_user_profile', userId, { fields });

        if (usernameChanged) {
            try {
                const io = getIO();
                const updatedUser = await this.userRepo.findById(userId);

                io.emit('username_changed', {
                    oldUsername,
                    newUsername: updateData.username,
                    profilePicture: updatedUser?.profilePicture
                        ? `/api/v1/profile/picture/${updatedUser.profilePicture}`
                        : null,
                    usernameFont: updatedUser?.usernameFont,
                    usernameGradient: updatedUser?.usernameGradient,
                    usernameGlow: updatedUser?.usernameGlow,
                });

                const sockets = this.presenceService.getSockets(oldUsername);
                if (sockets && sockets.length > 0) {
                    sockets.forEach((socketId) => {
                        const socket = io.sockets.sockets.get(socketId);
                        if (socket) {
                            socket.emit('force_logout', {
                                reason: 'Your username has been reset by a moderator.',
                            });
                            socket.disconnect(true);
                        }
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
        req: ExpressRequest,
        actionType: string,
        targetUserId?: string,
        additionalData?: Record<string, unknown>,
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
            }

            const auditData: {
                adminId: string;
                actionType: string;
                additionalData: Record<string, unknown>;
                targetUserId?: string;
            } = {
                adminId: (req as ExpressRequest & { user?: JWTPayload }).user?.id || 'unknown',
                actionType,
                additionalData: safeData,
            };

            if (targetUserId) {
                auditData.targetUserId = targetUserId;
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
        @Request() req: ExpressRequest,
    ): Promise<AdminSoftDeleteUserResponseDTO> {
        const { reason = 'No reason provided' } = body;

        const user = await this.userRepo.findById(userId);
        if (!user) {
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        if (user.deletedAt) {
            throw new BadRequestException(ErrorMessages.AUTH.USER_ALREADY_DELETED);
        }

        const oldUsername = user.username || '';
        const oldAvatar = user.profilePicture;

        const anonymizedUsername =
            user.anonymizedUsername || generateAnonymizedUsername(userId);

        await this.userRepo.update(userId, {
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

        await this.friendshipRepo.deleteAllRequestsForUser(userId);

        await this.logAdminAction(req, 'soft_delete_user', userId, {
            reason,
        });

        const friendships = await this.friendshipRepo.findAllByUserId(userId);
        const io = getIO();
        const offlineFriends: string[] = [];

        for (const friendship of friendships) {
            const friendUsername =
                friendship.userId?.toString() === userId
                    ? friendship.friend
                    : friendship.user;

            const friendUser = await this.userRepo.findByUsername(
                friendUsername || '',
            );
            if (friendUser) {
                const sockets = this.presenceService.getSockets(
                    friendUser.username || '',
                );
                if (sockets && sockets.length > 0) {
                    sockets.forEach((socketId) => {
                        io.to(socketId).emit('user_soft_deleted', {
                            oldUsername,
                            newUsername: anonymizedUsername,
                            userId: user._id.toString(),
                            avatar: DELETED_AVATAR_PATH,
                        });
                    });
                } else {
                    offlineFriends.push(friendUser._id.toString());
                }
            }
        }

        const deletedUserSockets = this.presenceService.getSockets(oldUsername);
        if (deletedUserSockets) {
            deletedUserSockets.forEach((socketId) => {
                const socket = io.sockets.sockets.get(socketId);
                if (socket) {
                    socket.emit('account_deleted', {
                        reason: 'Account has been deleted',
                    });
                    socket.disconnect(true);
                }
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
    @ApiOperation({ summary: 'Legacy delete endpoint that forwards to soft delete' })
    @ApiResponse({ status: 200, type: AdminDeleteUserResponseDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'User not found' })
    public async deleteUser(
        @Path('userId') userId: string,
        @Body() body: AdminSoftDeleteUserRequestDTO,
        @Request() req: ExpressRequest,
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
        @Request() req: ExpressRequest,
    ): Promise<AdminHardDeleteUserResponseDTO> {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const { reason = 'No reason provided' } = body;

            const user = await this.userRepo.findById(userId);
            if (!user) {
                await session.abortTransaction();
                throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
            }

            const username = user.username || '';
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
            await this.userRepo.incrementTokenVersion(userId);

            if (oldAvatar && oldAvatar !== DELETED_AVATAR_PATH) {
                await deleteAvatarFile(oldAvatar);
            }

            await this.userRepo.hardDelete(userId);

            await this.logAdminAction(req, 'hard_delete_user', userId, {
                reason,
            });

            await session.commitTransaction();

            const io = getIO();
            const offlineFriends: string[] = [];

            for (const friendship of friendships) {
                const friendUsername =
                    friendship.userId?.toString() === userId
                        ? friendship.friend
                        : friendship.user;

                const friendUser = await this.userRepo.findByUsername(
                    friendUsername || '',
                );
                if (friendUser) {
                    const sockets = this.presenceService.getSockets(
                        friendUser.username || '',
                    );
                    if (sockets && sockets.length > 0) {
                        sockets.forEach((socketId) => {
                            io.to(socketId).emit('user_hard_deleted', {
                                username,
                                userId,
                            });
                        });
                    } else {
                        offlineFriends.push(friendUser._id.toString());
                    }
                }
            }

            const deletedUserSockets =
                this.presenceService.getSockets(username);
            if (deletedUserSockets) {
                deletedUserSockets.forEach((socketId) => {
                    const socket = io.sockets.sockets.get(socketId);
                    if (socket) {
                        socket.emit('account_deleted', {
                            reason: 'Account has been deleted',
                        });
                        socket.disconnect(true);
                    }
                });
            }

            const response = new AdminHardDeleteUserResponseDTO();
            response.message = 'User and associated data hard deleted';
            response.sentMessagesAnonymized = sentMessagesUpdated.modifiedCount;
            response.receivedMessagesAnonymized = receivedMessagesUpdated.modifiedCount;
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
        @Request() req: ExpressRequest,
    ): Promise<AdminUpdateUserPermissionsResponseDTO> {
        const { permissions } = body;



        const user = await this.userRepo.findById(userId);
        if (!user) {
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        if (userId === (req as ExpressRequest & { user?: JWTPayload }).user?.id) {
            throw new BadRequestException('Cannot modify your own permissions');
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
        @Request() req: ExpressRequest,
    ): Promise<AdminBanUserResponseDTO> {
        const { reason, duration } = body;

        const targetUser = await this.userRepo.findById(userId);
        if (!targetUser) {
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        const expirationTimestamp = new Date(Date.now() + duration * 60 * 1000);
        const issuedById = (req as ExpressRequest & { user?: JWTPayload }).user?.id || 'unknown';

        const ban = await this.banRepo.createOrUpdateWithHistory({
            userId,
            reason: reason.trim(),
            issuedBy: issuedById,
            expirationTimestamp,
        });

        await this.logAdminAction(req, 'ban_user', userId, {
            reason: reason.trim(),
            duration,
        });

        const serverMemberships =
            await this.serverMemberRepo.findAllByUserId(userId);
        const io = getIO();

        for (const membership of serverMemberships) {
            await this.serverMemberRepo.deleteById(membership._id.toString());
            io.to(`server:${membership.serverId}`).emit('server_member_left', {
                serverId: membership.serverId,
                userId: targetUser.username || '',
            });
        }

        const sockets = this.presenceService.getSockets(
            targetUser.username || '',
        );
        if (sockets && sockets.length > 0) {
            sockets.forEach((sid) => {
                io.to(sid).emit('ban', {
                    reason: reason.trim(),
                    issuedBy: (req as ExpressRequest & { user?: JWTPayload }).user?.username,
                    expirationTimestamp,
                });
                io.sockets.sockets.get(sid)?.disconnect(true);
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
        @Request() req: ExpressRequest,
    ): Promise<AdminUnbanUserResponseDTO> {
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
        if (!ban || !ban.history || ban.history.length === 0) {
            return [];
        }

        const historyWithStatus: AdminUserBanHistoryResponseDTO = ban.history!.map(
            (entry, index: number) => {
                const item = new AdminBanHistoryItemDTO();
                const e = entry as Record<string, unknown>;
                item._id = String(e._id || '');
                item.reason = String(e.reason || '');
                item.timestamp = (e.timestamp as Date) || new Date();
                item.expirationTimestamp = (e.expirationTimestamp as Date) || new Date();
                item.issuedBy = String(e.issuedBy || 'unknown');
                item.active = index === ban.history!.length - 1 && (ban.active || false);
                return item;
            },
        );
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
        @Request() req: ExpressRequest,
    ): Promise<AdminWarnUserResponseDTO> {
        const { message } = body;

        const warning = await this.warningRepo.create({
            userId,
            issuedBy: (req as ExpressRequest & { user?: JWTPayload }).user?.id || 'unknown',
            message,
        });

        await this.logAdminAction(req, 'warn_user', userId, {
            reason: message,
        });

        const user = await this.userRepo.findById(userId);
        if (user) {
            const sockets = this.presenceService.getSockets(
                user.username || '',
            );
            if (sockets) {
                const io = getIO();
                sockets.forEach((sid) => {
                    io.to(sid).emit('warning', warning);
                });
            }
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
    public async getUserWarnings(@Path('userId') userId: string): Promise<AdminUserWarningsResponseDTO> {
        const warnings = await this.warningRepo.findByUserId(userId);
        return warnings.map(w => {
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
        return warnings.map(w => {
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
        @Query('limit') limit: number = 100,
        @Query('offset') offset: number = 0,
    ): Promise<AdminAuditLogListResponseDTO> {
        const logs = await this.auditLogRepo.find({
            limit: Number(limit),
            offset: Number(offset),
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
                const owner = owners.find(
                    (u) => u._id.toString() === server.ownerId.toString(),
                );
                const memberCount = await this.serverMemberRepo.countByServerId(
                    server._id.toString(),
                );
                const item = new AdminServerListItemDTO();
                item._id = server._id.toString();
                item.name = server.name;
                item.icon = server.icon ? `${server.icon}` : null;
                item.banner = server.banner;
                item.ownerId = server.ownerId.toString();
                item.memberCount = memberCount;
                item.createdAt = server.createdAt || new Date();
                item.deletedAt = server.deletedAt;
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
        @Request() req: ExpressRequest,
    ): Promise<AdminDeleteServerResponseDTO> {
        const server = await this.serverRepo.findById(serverId, true);
        if (!server) {
            throw new NotFoundException(ErrorMessages.SERVER.NOT_FOUND);
        }

        await this.serverRepo.softDelete(serverId);

        const io = getIO();
        io.to(`server:${serverId}`).emit('server_deleted', { serverId });

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
        @Request() req: ExpressRequest,
    ): Promise<AdminRestoreServerResponseDTO> {
        const server = await this.serverRepo.findById(serverId, true);

        if (!server) {
            throw new NotFoundException(ErrorMessages.SERVER.NOT_FOUND);
        }

        if (!server.deletedAt) {
            throw new BadRequestException(ErrorMessages.SERVER.NOT_DELETED);
        }

        await this.serverRepo.restore(serverId);

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
    @ApiOperation({ summary: 'Retrieve extended user details including servers' })
    @ApiResponse({ status: 200, type: AdminExtendedUserDetailsDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'User not found' })
    public async getExtendedUserDetails(
        @Path('userId') userId: string,
    ): Promise<AdminExtendedUserDetailsDTO> {
        const user = await this.userRepo.findById(userId);
        if (!user) {
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        const profilePictureUrl = user.deletedAt
            ? '/images/deleted-cat.jpg'
            : user.profilePicture
                ? `/api/v1/profile/picture/${user.profilePicture}`
                : null;

        const memberships = await this.serverMemberRepo.findByUserId(userId);
        const serverIds = memberships.map((m) => m.serverId.toString());
        const servers = await this.serverRepo.findByIds(serverIds);

        const serverList = await Promise.all(
            servers.map(async (server) => {
                const membership = memberships.find(
                    (m) => m.serverId.toString() === server._id.toString(),
                );
                const memberCount = await this.serverMemberRepo.countByServerId(
                    server._id.toString(),
                );
                return {
                    _id: server._id.toString(),
                    name: server.name,
                    icon: server.icon ? `${server.icon}` : null,
                    banner: server.banner,
                    ownerId: server.ownerId.toString(),
                    memberCount,
                    joinedAt: membership?.joinedAt,
                    isOwner: server.ownerId.toString() === userId,
                };
            }),
        );

        const activeBan = await this.banRepo.findActiveByUserId(userId);
        const warningCount = await this.warningRepo.countByUserId(userId);

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
        response.banner = user.banner ? `/api/v1/profile/banner/${user.banner}` : null;
        response.deletedAt = user.deletedAt;
        response.deletedReason = user.deletedReason;
        response.servers = serverList;

        return response;
    }
}

