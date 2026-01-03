import {
    Controller,
    Get,
    Post,
    Delete,
    Put,
    Route,
    Body,
    Path,
    Security,
    Response,
    Tags,
    Request,
    Query,
    Queries,
} from 'tsoa';
import { injectable, inject } from 'inversify';
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
import { ErrorResponse } from '@/controllers/models/ErrorResponse';
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
import express from 'express';
import { DashBoardStatsDTO } from './dto/admin-dashboard-stats.response.dto';
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
} from './dto/admin-servers.response.dto';
import { AdminListUsersRequestDTO } from './dto/admin-list-users.request.dto';

// Controller for administrative actions and dashboard statistics
@injectable()
@Route('api/v1/admin')
@Tags('Admin')
@Security('jwt')
export class AdminController extends Controller {
    constructor(
        @inject(TYPES.UserRepository) private userRepo: IUserRepository,
        @inject(TYPES.AuditLogRepository)
        private auditLogRepo: IAuditLogRepository,
        @inject(TYPES.FriendshipRepository)
        private friendshipRepo: IFriendshipRepository,
        @inject(TYPES.PresenceService) private presenceService: PresenceService,
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.BanRepository) private banRepo: IBanRepository,
        @inject(TYPES.ServerRepository) private serverRepo: IServerRepository,
        @inject(TYPES.MessageRepository)
        private messageRepo: IMessageRepository,
        @inject(TYPES.WarningRepository)
        private warningRepo: IWarningRepository,
        @inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
    ) {
        super();
    }

    // Retrieves high-level statistics for the admin dashboard
    @Get('stats')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @Security('jwt', ['viewLogs'])
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

        return {
            users,
            usersTrend: calculateTrend(users, newUsers),
            activeUsers: activeUsersCount,
            activeUsersTrend: 0,
            bans,
            bansTrend: calculateTrend(bans, newBans),
            servers,
            serversTrend: calculateTrend(servers, newServers),
            messages,
            messagesTrend: calculateTrend(messages, newMessages),
        };
    }

    // Lists users with optional search and filtering
    @Get('users')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @Security('jwt', ['viewUsers'])
    public async listUsers(
        @Queries() query: AdminListUsersRequestDTO,
    ): Promise<AdminUserListItemDTO[]> {
        // Build query options based on query parameters
        const options: any = {
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
                return {
                    _id: user._id.toString(),
                    username: user.username || '',
                    login: user.login || '',
                    displayName: user.displayName || null,
                    profilePicture: user.profilePicture || null,
                    permissions: user.permissions || '0',
                    createdAt: user.createdAt || new Date(),
                    banExpiry: activeBan?.expirationTimestamp,
                    warningCount,
                };
            }),
        );

        return enrichedUsers;
    }

    // Retrieves detailed information about a specific user
    @Get('users/{userId}')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @Response<ErrorResponse>('404', 'User not found', {
        error: ErrorMessages.AUTH.USER_NOT_FOUND,
    })
    @Security('jwt', ['viewUsers'])
    public async getUserDetails(
        @Path() userId: string,
        @Request() req: express.Request,
    ): Promise<AdminUserDetailsDTO> {
        const user = await this.userRepo.findById(userId);
        if (!user) {
            this.setStatus(404);
            this.logger.warn(
                `Admin ${(req as any).user?.login} tried to view non-existent user ${userId}`,
            );
            throw new Error(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        this.logger.info(
            `Admin ${(req as any).user?.login} viewed user details for ${userId}`,
        );
        const activeBan = await this.banRepo.findActiveByUserId(userId);
        const warningCount = await this.warningRepo.countByUserId(userId);

        let badges: any[] = [];
        if (user.badges && user.badges.length > 0) {
            badges = await Badge.find({ id: { $in: user.badges } });
        }

        return {
            _id: user._id.toString(),
            username: user.username || '',
            login: user.login || '',
            displayName: user.displayName || null,
            profilePicture: user.profilePicture || null,
            permissions: user.permissions || '0',
            createdAt: user.createdAt || new Date(),
            banExpiry: activeBan?.expirationTimestamp,
            warningCount,
            bio: user.bio || '',
            pronouns: user.pronouns || '',
            badges,
            banner: user.banner
                ? `/api/v1/profile/banner/${user.banner}`
                : null,
            deletedAt: user.deletedAt,
            deletedReason: user.deletedReason,
        };
    }

    // Resets specific profile fields for a user
    // Resetting the username forces a logout and requires the user to log in again
    @Post('users/{userId}/reset')
    @Response<ErrorResponse>('400', 'Invalid fields', {
        error: ErrorMessages.ADMIN.INVALID_FIELDS,
    })
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @Response<ErrorResponse>('404', 'User not found', {
        error: ErrorMessages.AUTH.USER_NOT_FOUND,
    })
    @Security('jwt', ['manageUsers'])
    public async resetUserProfile(
        @Path() userId: string,
        @Body() requestBody: AdminResetProfileRequestDTO,
        @Request() req: express.Request,
    ): Promise<AdminResetProfileResponseDTO> {
        const { fields } = requestBody;
        const user = await this.userRepo.findById(userId);
        if (!user) {
            this.setStatus(404);
            throw new Error(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        const updateData: any = {};
        const oldUsername = user.username || '';
        let usernameChanged = false;

        if (fields.includes('username')) {
            // Randomize username to avoid collisions and force logout
            const randomHex = crypto.randomBytes(8).toString('hex');
            updateData.username = `user_${randomHex}`;
            usernameChanged = true;
        }
        if (fields.includes('displayName')) updateData.displayName = '';
        if (fields.includes('pronouns')) updateData.pronouns = '';
        if (fields.includes('bio')) updateData.bio = '';
        if (fields.includes('banner')) updateData.banner = null;

        await this.userRepo.update(userId, updateData);

        try {
            // @ts-ignore
            const adminId = req.user?.id;

            const auditData: any = {
                adminId: adminId ? adminId.toString() : 'unknown',
                actionType: 'reset_user_profile',
                targetUserId: userId,
                additionalData: { fields },
            };
            if (req.ip) auditData.ip = req.ip;

            await this.auditLogRepo.create(auditData);
        } catch (error) {
            this.logger.error('Audit log error in TSOA controller:', error);
        }

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
                    'Failed to emit username change in TSOA controller:',
                    err,
                );
            }
        }

        return { message: 'User profile fields reset', fields };
    }

    // Helper method to log admin actions to audit log
    private async logAdminAction(
        req: express.Request,
        actionType: string,
        targetUserId?: string,
        additionalData?: any,
    ): Promise<void> {
        try {
            const safeData: any = {};
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

            const auditData: any = {
                // @ts-ignore
                adminId: req.user?.id || 'unknown',
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

    // Soft deletes a user account
    @Post('users/{userId}/soft-delete')
    @Response<ErrorResponse>('400', 'User already deleted', {
        error: ErrorMessages.AUTH.USER_ALREADY_DELETED,
    })
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @Response<ErrorResponse>('404', 'User not found', {
        error: ErrorMessages.AUTH.USER_NOT_FOUND,
    })
    @Security('jwt', ['manageUsers'])
    public async softDeleteUser(
        @Path() userId: string,
        @Body() body: AdminSoftDeleteUserRequestDTO,
        @Request() req: express.Request,
    ): Promise<AdminSoftDeleteUserResponseDTO> {
        const { reason = 'No reason provided' } = body;

        const user = await this.userRepo.findById(userId);
        if (!user) {
            this.setStatus(404);
            throw new Error(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        if (user.deletedAt) {
            this.setStatus(400);
            throw new Error(ErrorMessages.AUTH.USER_ALREADY_DELETED);
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

        return {
            message: 'User soft deleted',
            anonymizedUsername,
            offlineFriends: offlineFriends.length,
        };
    }

    // Legacy delete endpoint that forwards to soft delete
    @Delete('users/{userId}')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @Response<ErrorResponse>('404', 'User not found', {
        error: ErrorMessages.AUTH.USER_NOT_FOUND,
    })
    @Security('jwt', ['manageUsers'])
    public async deleteUser(
        @Path() userId: string,
        @Body() body: AdminSoftDeleteUserRequestDTO,
        @Request() req: express.Request,
    ): Promise<AdminDeleteUserResponseDTO> {
        const result = await this.softDeleteUser(userId, body, req);
        return {
            message: 'User deleted',
            anonymizedUsername: result.anonymizedUsername,
        };
    }

    // Hard deletes a user account completely
    @Post('users/{userId}/hard-delete')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @Response<ErrorResponse>('404', 'User not found', {
        error: ErrorMessages.AUTH.USER_NOT_FOUND,
    })
    @Security('jwt', ['manageUsers'])
    public async hardDeleteUser(
        @Path() userId: string,
        @Body() body: AdminSoftDeleteUserRequestDTO,
        @Request() req: express.Request,
    ): Promise<AdminHardDeleteUserResponseDTO> {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const { reason = 'No reason provided' } = body;

            const user = await this.userRepo.findById(userId);
            if (!user) {
                await session.abortTransaction();
                this.setStatus(404);
                throw new Error(ErrorMessages.AUTH.USER_NOT_FOUND);
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

            return {
                message: 'User and associated data hard deleted',
                sentMessagesAnonymized: sentMessagesUpdated.modifiedCount,
                receivedMessagesAnonymized:
                    receivedMessagesUpdated.modifiedCount,
                offlineFriends: offlineFriends.length,
            };
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }

    // Updates a user's permissions
    @Put('users/{userId}/permissions')
    @Response<ErrorResponse>('400', 'Invalid permissions', {
        error: ErrorMessages.ADMIN.INVALID_PERMISSIONS,
    })
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @Response<ErrorResponse>('404', 'User not found', {
        error: ErrorMessages.AUTH.USER_NOT_FOUND,
    })
    @Security('jwt', ['manageUsers'])
    public async updateUserPermissions(
        @Path() userId: string,
        @Body() body: AdminUpdateUserPermissionsRequestDTO,
        @Request() req: express.Request,
    ): Promise<AdminUpdateUserPermissionsResponseDTO> {
        const { permissions } = body;

        if (!permissions || typeof permissions !== 'object') {
            this.setStatus(400);
            throw new Error(ErrorMessages.ADMIN.INVALID_PERMISSIONS);
        }

        const user = await this.userRepo.findById(userId);
        if (!user) {
            this.setStatus(404);
            throw new Error(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        // @ts-ignore
        if (userId === req.user?.id) {
            this.setStatus(400);
            throw new Error('Cannot modify your own permissions');
        }

        await this.userRepo.updatePermissions(userId, permissions);
        await this.logAdminAction(req, 'update_permissions', userId, {
            permissions,
        });

        return { message: 'Permissions updated' };
    }

    // Bans a user for a specified duration
    @Post('users/{userId}/ban')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @Response<ErrorResponse>('404', 'User not found', {
        error: ErrorMessages.AUTH.USER_NOT_FOUND,
    })
    @Security('jwt', ['banUsers'])
    public async banUser(
        @Path() userId: string,
        @Body() body: AdminBanUserRequestDTO,
        @Request() req: express.Request,
    ): Promise<AdminBanUserResponseDTO> {
        const { reason, duration } = body;

        const targetUser = await this.userRepo.findById(userId);
        if (!targetUser) {
            this.setStatus(404);
            throw new Error(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        const expirationTimestamp = new Date(Date.now() + duration * 60 * 1000);
        // @ts-ignore
        const issuedById = req.user?.id || 'unknown';

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
                    // @ts-ignore
                    issuedBy: req.user?.username,
                    expirationTimestamp,
                });
                io.sockets.sockets.get(sid)?.disconnect(true);
            });
        }

        return {
            _id: ban._id.toString(),
            userId: ban.userId.toString(),
            reason: ban.reason || '',
            issuedBy: ban.issuedBy?.toString() || 'unknown',
            expirationTimestamp: ban.expirationTimestamp || new Date(),
            active: ban.active || false,
            history: ban.history || [],
        };
    }

    // Unbans a user
    @Post('users/{userId}/unban')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @Security('jwt', ['banUsers'])
    public async unbanUser(
        @Path() userId: string,
        @Request() req: express.Request,
    ): Promise<AdminUnbanUserResponseDTO> {
        await this.banRepo.deactivateAllForUser(userId);
        await this.logAdminAction(req, 'unban_user', userId);
        return { message: 'User unbanned' };
    }

    // Retrieves ban history for a user
    @Get('users/{userId}/bans')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @Security('jwt', ['viewBans'])
    public async getUserBanHistory(
        @Path() userId: string,
    ): Promise<AdminUserBanHistoryResponseDTO> {
        const ban = await this.banRepo.findByUserIdWithHistory(userId);
        if (!ban || !ban.history || ban.history.length === 0) {
            return [];
        }

        const historyWithStatus: AdminUserBanHistoryResponseDTO = ban.history!.map(
            (entry: any, index: number) => ({
                _id: entry._id.toString(),
                reason: entry.reason || '',
                timestamp: entry.timestamp || new Date(),
                expirationTimestamp: entry.expirationTimestamp || new Date(),
                issuedBy: entry.issuedBy?.toString() || 'unknown',
                active: index === ban.history!.length - 1 && (ban.active || false),
            }),
        );
        return historyWithStatus;
    }

    // Lists all bans with pagination
    @Get('bans')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @Security('jwt', ['viewBans'])
    public async listBans(
        @Query() limit: number = 50,
        @Query() offset: number = 0,
    ): Promise<AdminBanListResponseDTO> {
        const bans = await this.banRepo.findAll({
            limit: Number(limit),
            offset: Number(offset),
        });
        return bans;
    }

    // Diagnostic endpoint for ban collections
    @Get('bans/diagnostic')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @Security('jwt', ['viewBans'])
    public async getBansDiagnostic(): Promise<AdminBansDiagnosticResponseDTO> {
        const appBansCount = await Ban.countDocuments();
        const appBansSample = await Ban.find({}).limit(5).lean();

        const serverBansCount = await ServerBan.countDocuments();
        const serverBansSample = await ServerBan.find({}).limit(5).lean();

        return {
            appBans: {
                count: appBansCount,
                sample: appBansSample,
            },
            serverBans: {
                count: serverBansCount,
                sample: serverBansSample,
            },
        };
    }

    // Warns a user
    @Post('users/{userId}/warn')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @Security('jwt', ['warnUsers'])
    public async warnUser(
        @Path() userId: string,
        @Body() body: AdminWarnUserRequestDTO,
        @Request() req: express.Request,
    ): Promise<AdminWarnUserResponseDTO> {
        const { message } = body;

        // @ts-ignore
        const warning = await this.warningRepo.create({
            userId,
            // @ts-ignore
            issuedBy: req.user?.id,
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

        return {
            _id: warning._id.toString(),
            userId: warning.userId.toString(),
            issuedBy: warning.issuedBy.toString(),
            message: warning.message,
            timestamp: warning.timestamp,
        };
    }

    // Retrieves warnings for a user
    @Get('users/{userId}/warnings')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @Security('jwt', ['warnUsers'])
    public async getUserWarnings(@Path() userId: string): Promise<AdminUserWarningsResponseDTO> {
        const warnings = await this.warningRepo.findByUserId(userId);
        return warnings;
    }

    // Lists all warnings with pagination
    @Get('warnings')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @Security('jwt', ['warnUsers'])
    public async listWarnings(
        @Query() limit: number = 50,
        @Query() offset: number = 0,
    ): Promise<AdminWarningListResponseDTO> {
        const warnings = await this.warningRepo.findAll({
            limit: Number(limit),
            offset: Number(offset),
        });
        return warnings;
    }

    // Lists audit logs with pagination
    @Get('logs')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @Security('jwt', ['viewLogs'])
    public async listAuditLogs(
        @Query() limit: number = 100,
        @Query() offset: number = 0,
    ): Promise<AdminAuditLogListResponseDTO> {
        const logs = await this.auditLogRepo.find({
            limit: Number(limit),
            offset: Number(offset),
        });
        return logs;
    }

    // Lists servers with owner details
    @Get('servers')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @Security('jwt', ['manageServer'])
    public async listServers(
        @Query() limit: number = 50,
        @Query() offset: number = 0,
        @Query() search?: string,
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
                return {
                    _id: server._id.toString(),
                    name: server.name,
                    icon: server.icon ? `${server.icon}` : null,
                    banner: server.banner,
                    ownerId: server.ownerId.toString(),
                    memberCount,
                    createdAt: server.createdAt || new Date(),
                    deletedAt: server.deletedAt,
                    owner: owner
                        ? {
                            _id: owner._id.toString(),
                            username: owner.username || '',
                            displayName: owner.displayName || null,
                            profilePicture: owner.profilePicture
                                ? `/api/v1/profile/picture/${owner.profilePicture}`
                                : null,
                        }
                        : null,
                };
            }),
        );

        return enrichedServers;
    }

    // Soft deletes a server
    @Delete('servers/{serverId}')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @Response<ErrorResponse>('404', 'Server not found', {
        error: ErrorMessages.SERVER.NOT_FOUND,
    })
    @Security('jwt', ['manageServer'])
    public async deleteServer(
        @Path() serverId: string,
        @Request() req: express.Request,
    ): Promise<AdminDeleteServerResponseDTO> {
        const server = await this.serverRepo.findById(serverId, true);
        if (!server) {
            this.setStatus(404);
            throw new Error(ErrorMessages.SERVER.NOT_FOUND);
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

        return { message: 'Server deleted' };
    }

    // Restores a deleted server
    @Post('servers/{serverId}/restore')
    @Response<ErrorResponse>('400', 'Server not deleted', {
        error: ErrorMessages.SERVER.NOT_DELETED,
    })
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @Response<ErrorResponse>('404', 'Server not found', {
        error: ErrorMessages.SERVER.NOT_FOUND,
    })
    @Security('jwt', ['manageServer'])
    public async restoreServer(
        @Path() serverId: string,
        @Request() req: express.Request,
    ): Promise<AdminRestoreServerResponseDTO> {
        const server = await this.serverRepo.findById(serverId, true);

        if (!server) {
            this.setStatus(404);
            throw new Error(ErrorMessages.SERVER.NOT_FOUND);
        }

        if (!server.deletedAt) {
            this.setStatus(400);
            throw new Error(ErrorMessages.SERVER.NOT_DELETED);
        }

        await this.serverRepo.restore(serverId);

        await this.logAdminAction(
            req,
            'restore_server',
            server.ownerId.toString(),
            { serverId, serverName: server.name },
        );

        return { message: 'Server restored' };
    }

    // Extended user details with servers
    @Get('users/{userId}/details')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @Response<ErrorResponse>('404', 'User not found', {
        error: ErrorMessages.AUTH.USER_NOT_FOUND,
    })
    @Security('jwt', ['viewUsers'])
    public async getExtendedUserDetails(
        @Path() userId: string,
    ): Promise<AdminExtendedUserDetailsDTO> {
        const user = await this.userRepo.findById(userId);
        if (!user) {
            this.setStatus(404);
            throw new Error(ErrorMessages.AUTH.USER_NOT_FOUND);
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

        let badges: any[] = [];
        if (user.badges && user.badges.length > 0) {
            badges = await Badge.find({ id: { $in: user.badges } });
        }

        return {
            _id: user._id.toString(),
            username: user.username || '',
            login: user.login || '',
            displayName: user.displayName || null,
            profilePicture: profilePictureUrl,
            permissions: user.permissions || '0',
            createdAt: user.createdAt || new Date(),
            banExpiry: activeBan?.expirationTimestamp,
            warningCount,
            bio: user.bio || '',
            pronouns: user.pronouns || '',
            badges,
            banner: user.banner
                ? `/api/v1/profile/banner/${user.banner}`
                : null,
            deletedAt: user.deletedAt,
            deletedReason: user.deletedReason,
            servers: serverList,
        };
    }
}
