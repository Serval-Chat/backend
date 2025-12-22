import {
    Controller,
    Get,
    Post,
    Route,
    Body,
    Path,
    Security,
    Response,
    Tags,
    Request,
    Query,
    Hidden,
} from 'tsoa';
import { injectable, inject } from 'inversify';
import { TYPES } from '../di/types';
import type { IUserRepository } from '../di/interfaces/IUserRepository';
import type { IAuditLogRepository } from '../di/interfaces/IAuditLogRepository';
import type { IFriendshipRepository } from '../di/interfaces/IFriendshipRepository';
import type { IBanRepository } from '../di/interfaces/IBanRepository';
import type { IServerRepository } from '../di/interfaces/IServerRepository';
import type { IMessageRepository } from '../di/interfaces/IMessageRepository';
import type { IWarningRepository } from '../di/interfaces/IWarningRepository';
import { PresenceService } from '../realtime/services/PresenceService';
import { PermissionService } from '../services/PermissionService';
import { ErrorResponse } from './models/ErrorResponse';
import { ErrorMessages } from '../constants/errorMessages';
import type { ILogger } from '../di/interfaces/ILogger';
import { AdminPermissions } from '../routes/api/v1/admin/permissions';
import crypto from 'crypto';
import { getIO } from '../socket';
import express from 'express';

/**
 * Request body for resetting user profile fields.
 */
interface ResetProfileRequest {
    /**
     * Fields to reset (e.g., 'username', 'displayName', 'pronouns', 'bio').
     * Resetting 'username' forces a logout.
     */
    fields: string[];
}

interface DashboardStats {
    users: number;
    usersTrend: number;
    activeUsers: number;
    activeUsersTrend: number;
    bans: number;
    bansTrend: number;
    servers: number;
    serversTrend: number;
    messages: number;
    messagesTrend: number;
}

interface UserListItem {
    _id: string;
    username: string;
    login: string;
    displayName: string | null;
    profilePicture: string | null;
    permissions: string | AdminPermissions;
    createdAt: Date;
    banExpiry?: Date;
    warningCount: number;
}

/**
 * Extended user details for administrative view.
 */
interface UserDetails extends UserListItem {
    bio: string;
    pronouns: string;
    badges: any[];
    deletedAt?: Date;
    deletedReason?: string;
}

/**
 * Controller for administrative actions and dashboard statistics.
 * Enforces 'viewLogs', 'viewUsers', and 'resetUserProfile' permissions.
 */
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
    ) {
        super();
    }

    /**
     * Retrieves high-level statistics for the admin dashboard.
     */
    @Get('stats')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @Security('jwt', ['viewLogs'])
    public async getStats(): Promise<DashboardStats> {
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

    /**
     * Lists users with optional search and filtering.
     */
    @Get('users')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @Security('jwt', ['viewUsers'])
    public async listUsers(
        @Query() limit: number = 50,
        @Query() offset: number = 0,
        @Query() search?: string,
        @Query() filter?: 'banned' | 'admin' | 'recent',
        @Query() includeDeleted?: boolean,
    ): Promise<UserListItem[]> {
        // Build query options based on query parameters
        const options: any = {
            limit,
            offset,
            includeDeleted: includeDeleted === true,
        };
        if (search) options.search = search;
        if (filter) options.filter = filter;

        const users = await this.userRepo.findMany(options);

        // Enriched users include ban status and warning counts
        const enrichedUsers = await Promise.all(
            users.map(async (u) => {
                const activeBan = await this.banRepo.findActiveByUserId(
                    u._id.toString(),
                );
                const warningCount = await this.warningRepo.countByUserId(
                    u._id.toString(),
                );
                return {
                    _id: u._id.toString(),
                    username: u.username || '',
                    login: u.login || '',
                    displayName: u.displayName || null,
                    profilePicture: u.profilePicture || null,
                    permissions: u.permissions || '0',
                    createdAt: u.createdAt || new Date(),
                    banExpiry: activeBan?.expirationTimestamp,
                    warningCount,
                };
            }),
        );

        return enrichedUsers;
    }

    /**
     * Retrieves detailed information about a specific user.
     */
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
    ): Promise<UserDetails> {
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

        const { Badge } = await import('../models/Badge'); // plz dont do circular dependencies :(
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
            deletedAt: user.deletedAt,
            deletedReason: user.deletedReason,
        };
    }

    /**
     * Resets specific profile fields for a user.
     * Resetting the username forces a logout and requires the user to log in again.
     */
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
    @Security('jwt', ['resetUserProfile'])
    public async resetUserProfile(
        @Path() userId: string,
        @Body() requestBody: ResetProfileRequest,
        @Request() req: express.Request,
    ): Promise<{ message: string; fields: string[] }> {
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
}
