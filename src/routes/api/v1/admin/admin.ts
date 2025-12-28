import express from 'express';
import { type AuthenticatedRequest } from '@/middleware/auth';
import mongoose from 'mongoose';
import logger from '@/utils/logger';
import { container } from '@/di/container';
import { TYPES } from '@/di/types';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type { IBanRepository } from '@/di/interfaces/IBanRepository';
import type { IWarningRepository } from '@/di/interfaces/IWarningRepository';
import type { IAuditLogRepository } from '@/di/interfaces/IAuditLogRepository';
import type { IMessageRepository } from '@/di/interfaces/IMessageRepository';
import type { IFriendshipRepository } from '@/di/interfaces/IFriendshipRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IServerRepository } from '@/di/interfaces/IServerRepository';
import rateLimit from 'express-rate-limit';
import { Types } from 'mongoose';
import { getIO } from '@/socket';
import type { PresenceService } from '@/realtime/services/PresenceService';
import {
    generateAnonymizedUsername,
    DELETED_AVATAR_PATH,
    deleteAvatarFile,
} from '@/utils/deletion';
import { validate } from '@/validation/middleware';
import {
    listUsersQuerySchema,
    userIdParamSchema,
    softDeleteUserSchema,
    banUserSchema,
    warnUserSchema,
    resetProfileSchema,
} from '@/validation/schemas/admin';
import { serverIdParamSchema } from '@/validation/schemas/servers';
import badgeRoutes from '@/routes/api/v1/admin/badges';
import inviteRoutes from '@/routes/api/v1/admin/invites';
import { requireAdmin } from '@/routes/api/v1/admin/middlewares/requireAdmin';
import { AdminPermissions } from '@/routes/api/v1/admin/permissions';
import { Ban } from '@/models/Ban';
import { ServerBan } from '@/models/Server';
import crypto from 'crypto';

const router = express.Router();

// DI Repositories
const userRepo = container.get<IUserRepository>(TYPES.UserRepository);
const banRepo = container.get<IBanRepository>(TYPES.BanRepository);
const warningRepo = container.get<IWarningRepository>(TYPES.WarningRepository);
const auditLogRepo = container.get<IAuditLogRepository>(
    TYPES.AuditLogRepository,
);
const messageRepo = container.get<IMessageRepository>(TYPES.MessageRepository);
const friendshipRepo = container.get<IFriendshipRepository>(
    TYPES.FriendshipRepository,
);
const serverMemberRepo = container.get<IServerMemberRepository>(
    TYPES.ServerMemberRepository,
);
const serverRepo = container.get<IServerRepository>(TYPES.ServerRepository);
const presenceService = container.get<PresenceService>(TYPES.PresenceService);

// Rate Limiting
const adminRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: (req) => {
        const userPermissions = (req as AuthenticatedRequest).user?.permissions;
        if (!userPermissions) return 100;

        try {
            const permissions =
                typeof userPermissions === 'string'
                    ? JSON.parse(userPermissions)
                    : userPermissions;

            return permissions && permissions.adminAccess ? 1000 : 100;
        } catch (e) {
            return 100;
        }
    },
    message: 'Too many admin requests, please try again later.',
});

const logAdminAction = async (
    req: AuthenticatedRequest,
    actionType: string,
    targetUserId?: string,
    additionalData?: any,
) => {
    try {
        // Whitelist additionalData
        const safeData: any = {};
        if (additionalData) {
            if (additionalData.reason) safeData.reason = additionalData.reason;
            if (additionalData.duration)
                safeData.duration = additionalData.duration;
            if (additionalData.count) safeData.count = additionalData.count;
        }

        const auditData: {
            adminId: string;
            actionType: string;
            targetUserId?: string;
            additionalData?: any;
        } = {
            adminId: req.user.id,
            actionType,
            additionalData: safeData,
        };

        if (targetUserId) {
            auditData.targetUserId = targetUserId;
        }

        await auditLogRepo.create(auditData);
    } catch (error) {
        logger.error('Audit log error:', error);
    }
};

router.use(adminRateLimit);

// --- Endpoints ---

// Get Dashboard Stats
/**
 * GET /api/v1/admin/stats
 *
 * Retrieves dashboard statistics including counts and trends.
 * Trends are calculated based on new items created in the last 24 hours.
 */
router.get('/stats', requireAdmin('viewLogs'), async (req, res) => {
    try {
        const authReq = req as AuthenticatedRequest;
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // Get current counts
        const [users, bans, servers, messages] = await Promise.all([
            userRepo.count(),
            banRepo.countActive(),
            serverRepo.count(),
            messageRepo.count(),
        ]);

        const [newUsers, newBans, newServers, newMessages] = await Promise.all([
            userRepo.countCreatedAfter(oneDayAgo),
            banRepo.countCreatedAfter(oneDayAgo),
            serverRepo.countCreatedAfter(oneDayAgo),
            messageRepo.countCreatedAfter(oneDayAgo),
        ]);

        const calculateTrend = (current: number, recent: number) => {
            const previous = current - recent;
            if (previous === 0) return recent > 0 ? 100 : 0;
            return Math.round(((current - previous) / previous) * 100);
        };

        // Active users from PresenceService
        const activeUsersCount = presenceService.getAllOnlineUsers().length;

        res.json({
            users,
            usersTrend: calculateTrend(users, newUsers),
            activeUsers: activeUsersCount,
            activeUsersTrend: 0, // No historical data for presence
            bans,
            bansTrend: calculateTrend(bans, newBans),
            servers,
            serversTrend: calculateTrend(servers, newServers),
            messages,
            messagesTrend: calculateTrend(messages, newMessages),
        });
    } catch (error) {
        logger.error('[ADMIN] Failed to fetch stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// List Users
/**
 * GET /api/v1/admin/users
 *
 * Lists users with pagination, search, and filtering.
 * Enriches user data with ban expiry and warning counts.
 */
router.get(
    '/users',
    requireAdmin('viewUsers'),
    validate({ query: listUsersQuerySchema }),
    async (req, res) => {
        try {
            const authReq = req as AuthenticatedRequest;
            const {
                limit = 50,
                offset = 0,
                search,
                filter,
                includeDeleted,
            } = req.query;

            const users = await userRepo.findMany({
                limit: Number(limit),
                offset: Number(offset),
                search: search as string,
                filter: filter as 'banned' | 'admin' | 'recent',
                includeDeleted: includeDeleted === 'true',
            });

            // Enrich with extra data
            const enrichedUsers = await Promise.all(
                users.map(async (u) => {
                    const activeBan = await banRepo.findActiveByUserId(
                        u._id.toString(),
                    );
                    const warningCount = await warningRepo.countByUserId(
                        u._id.toString(),
                    );
                    return {
                        ...u,
                        banExpiry: activeBan?.expirationTimestamp,
                        warningCount,
                    };
                }),
            );

            res.json(enrichedUsers);
        } catch (error) {
            res.status(500).json({ error: 'Failed to list users' });
        }
    },
);

// Soft Delete User
router.post(
    '/users/:id/soft-delete',
    requireAdmin('manageUsers'),
    validate({ params: userIdParamSchema, body: softDeleteUserSchema }),
    async (req, res) => {
        try {
            const authReq = req as AuthenticatedRequest;
            const { reason = 'No reason provided' } = req.body;
            const userId = req.params.id as string;

            const user = await userRepo.findById(userId);
            if (!user) return res.status(404).json({ error: 'User not found' });

            if (user.deletedAt) {
                return res
                    .status(400)
                    .json({ error: 'User already soft deleted' });
            }

            const oldUsername = user.username || '';
            const oldAvatar = user.profilePicture;

            // Generate permanent anonymizedUsername (only if not already set)
            const anonymizedUsername =
                user.anonymizedUsername || generateAnonymizedUsername(userId);

            // Update user with soft delete data
            await userRepo.update(userId, {
                deletedAt: new Date(),
                deletedReason: reason,
                profilePicture: DELETED_AVATAR_PATH,
                login: `deleted_${userId}`,
                anonymizedUsername,
                tokenVersion: (user.tokenVersion || 0) + 1,
            });

            // Delete avatar file using storage driver
            if (oldAvatar) {
                await deleteAvatarFile(oldAvatar);
            }

            // Remove all pending friend requests
            await friendshipRepo.deleteAllRequestsForUser(userId);

            await logAdminAction(authReq, 'soft_delete_user', userId, {
                reason,
            });

            // Get friends of this user to send targeted socket events
            const friendships = await friendshipRepo.findAllByUserId(userId);

            // Notify only ONLINE friends that user is now soft deleted
            const io = getIO();
            const offlineFriends: string[] = [];

            for (const friendship of friendships) {
                const friendUsername =
                    friendship.userId?.toString() === userId
                        ? friendship.friend
                        : friendship.user;

                const friendUser = await userRepo.findByUsername(
                    friendUsername || '',
                );
                if (friendUser) {
                    const sockets = presenceService.getSockets(
                        friendUser.username || '',
                    );
                    if (sockets && sockets.length > 0) {
                        // Friend is online - send event now
                        sockets.forEach((socketId) => {
                            io.to(socketId).emit('user_soft_deleted', {
                                oldUsername,
                                newUsername: anonymizedUsername,
                                userId: user._id.toString(),
                                avatar: DELETED_AVATAR_PATH,
                            });
                        });
                    } else {
                        // Friend is offline - store pending deletion event
                        offlineFriends.push(friendUser._id.toString());
                    }
                }
            }

            // Disconnect the deleted user's socket connections
            const deletedUserSockets = presenceService.getSockets(oldUsername);
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
                // presenceService automatically handles removal on disconnect
            }

            res.json({
                message: 'User soft deleted',
                anonymizedUsername,
                offlineFriends: offlineFriends.length,
            });
        } catch (error) {
            logger.error('[ADMIN] Failed to soft delete user:', error);
            res.status(500).json({ error: 'Failed to soft delete user' });
        }
    },
);

// Legacy DELETE endpoint - forwards to soft delete
router.delete(
    '/users/:id',
    requireAdmin('manageUsers'),
    validate({ params: userIdParamSchema, body: softDeleteUserSchema }),
    async (req, res) => {
        const authReq = req as AuthenticatedRequest;
        const userId = req.params.id as string;
        const reason = req.body.reason || 'Deleted via legacy endpoint';

        try {
            const user = await userRepo.findById(userId);
            if (!user) return res.status(404).json({ error: 'User not found' });

            if (user.deletedAt) {
                return res
                    .status(400)
                    .json({ error: 'User already soft deleted' });
            }

            const oldUsername = user.username || '';
            const anonymizedUsername =
                user.anonymizedUsername || generateAnonymizedUsername(userId);

            // Update user with soft delete data
            await userRepo.update(userId, {
                deletedAt: new Date(),
                deletedReason: reason,
                profilePicture: DELETED_AVATAR_PATH,
                login: `deleted_${userId}`,
                anonymizedUsername,
                tokenVersion: (user.tokenVersion || 0) + 1,
            });

            if (user.profilePicture) {
                await deleteAvatarFile(user.profilePicture);
            }

            await friendshipRepo.deleteAllRequestsForUser(userId);
            await logAdminAction(authReq, 'soft_delete_user', userId, {
                reason,
            });

            const friendships = await friendshipRepo.findAllByUserId(userId);
            const io = getIO();

            for (const friendship of friendships) {
                const friendUsername =
                    friendship.userId?.toString() === userId
                        ? friendship.friend
                        : friendship.user;

                const friendUser = await userRepo.findByUsername(
                    friendUsername || '',
                );
                if (friendUser) {
                    const sockets = presenceService.getSockets(
                        friendUser.username || '',
                    );
                    if (sockets) {
                        sockets.forEach((socketId) => {
                            io.to(socketId).emit('user_soft_deleted', {
                                oldUsername,
                                newUsername: anonymizedUsername,
                                userId: user._id.toString(),
                                avatar: DELETED_AVATAR_PATH,
                            });
                        });
                    }
                }
            }

            res.json({ message: 'User deleted', anonymizedUsername });
        } catch (error) {
            logger.error('[ADMIN] Failed to delete user:', error);
            res.status(500).json({ error: 'Failed to delete user' });
        }
    },
);

// Hard Delete User (complete purge with MongoDB transaction)
router.post(
    '/users/:id/hard-delete',
    requireAdmin('manageUsers'),
    validate({ params: userIdParamSchema, body: softDeleteUserSchema }),
    async (req, res) => {
        const authReq = req as AuthenticatedRequest;
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const { reason = 'No reason provided' } = req.body;
            const userId = req.params.id as string;

            const user = await userRepo.findById(userId);
            if (!user) {
                await session.abortTransaction();
                return res.status(404).json({ error: 'User not found' });
            }

            const username = user.username || '';
            const oldAvatar = user.profilePicture;

            // 1. Anonymize all messages SENT by this user
            const sentMessagesUpdated = await messageRepo.updateManyBySenderId(
                userId,
                {
                    senderDeleted: true,
                    anonymizedSender: 'Deleted User',
                },
            );

            // 1b. Anonymize all messages RECEIVED by this user
            const receivedMessagesUpdated =
                await messageRepo.updateManyByReceiverId(userId, {
                    receiverDeleted: true,
                    anonymizedReceiver: 'Deleted User',
                });

            // Get friends BEFORE deletion for socket notification
            const friendships = await friendshipRepo.findAllByUserId(userId);

            // 2. Delete all friendships
            await friendshipRepo.deleteAllForUser(userId);

            // 3. Delete all friend requests
            await friendshipRepo.deleteAllRequestsForUser(userId);

            // 4. Delete warnings
            await warningRepo.deleteAllForUser(userId);

            // 5. Delete bans
            await banRepo.deleteAllForUser(userId);

            // 6. Increment tokenVersion to invalidate all JWTs
            await userRepo.incrementTokenVersion(userId);

            // 7. Delete avatar file using storage driver
            if (oldAvatar && oldAvatar !== DELETED_AVATAR_PATH) {
                await deleteAvatarFile(oldAvatar);
            }

            // 8. Finally, delete the user document
            await userRepo.hardDelete(userId);

            await logAdminAction(authReq, 'hard_delete_user', userId, {
                reason,
            });

            await session.commitTransaction();

            // Notify only friends to completely remove this user
            const io = getIO();
            const offlineFriends: string[] = [];

            for (const friendship of friendships) {
                const friendUsername =
                    friendship.userId?.toString() === userId
                        ? friendship.friend
                        : friendship.user;

                const friendUser = await userRepo.findByUsername(
                    friendUsername || '',
                );
                if (friendUser) {
                    const sockets = presenceService.getSockets(
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

            // Disconnect the deleted user's socket connections
            const deletedUserSockets = presenceService.getSockets(username);
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
                // presenceService automatically handles removal on disconnect
            }

            res.json({
                message: 'User and associated data hard deleted',
                sentMessagesAnonymized: sentMessagesUpdated.modifiedCount,
                receivedMessagesAnonymized:
                    receivedMessagesUpdated.modifiedCount,
                offlineFriends: offlineFriends.length,
            });
        } catch (error) {
            await session.abortTransaction();
            logger.error('[ADMIN] Failed to hard delete user:', error);
            res.status(500).json({ error: 'Failed to hard delete user' });
        } finally {
            session.endSession();
        }
    },
);

// Ban User
router.put(
    '/users/:id/permissions',
    requireAdmin('manageUsers'),
    validate({ params: userIdParamSchema }),
    async (req, res) => {
        try {
            const authReq = req as AuthenticatedRequest;
            const userId = req.params.id as string;
            const { permissions } = req.body;

            if (!permissions || typeof permissions !== 'object') {
                return res
                    .status(400)
                    .json({ error: 'Invalid permissions object' });
            }

            const user = await userRepo.findById(userId);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            // Prevent modifying own permissions to avoid locking oneself out
            if (userId === authReq.user.id) {
                return res
                    .status(400)
                    .json({ error: 'Cannot modify your own permissions' });
            }

            await userRepo.updatePermissions(userId, permissions);
            await logAdminAction(authReq, 'update_permissions', userId, {
                permissions,
            });

            res.json({ message: 'Permissions updated' });
        } catch (error) {
            logger.error('[ADMIN] Failed to update permissions:', error);
            res.status(500).json({ error: 'Failed to update permissions' });
        }
    },
);

// Ban User
/**
 * POST /api/v1/admin/users/:id/ban
 *
 * Bans a user for a specified duration.
 * Removes the user from all servers and disconnects active sessions.
 */
router.post(
    '/users/:id/ban',
    requireAdmin('banUsers'),
    validate({ params: userIdParamSchema, body: banUserSchema }),
    async (req, res) => {
        try {
            const authReq = req as AuthenticatedRequest;
            const { reason, duration } = req.body; // duration in minutes
            const userIdParam = (req.params.id || '').trim();

            const targetUser = await userRepo.findById(userIdParam);
            if (!targetUser) {
                return res.status(404).json({ error: 'User not found' });
            }

            const expirationTimestamp = new Date(
                Date.now() + duration * 60 * 1000,
            );
            const issuedById = authReq.user.id;

            const ban = await banRepo.createOrUpdateWithHistory({
                userId: userIdParam,
                reason: reason.trim(),
                issuedBy: issuedById,
                expirationTimestamp,
            });

            await logAdminAction(authReq, 'ban_user', userIdParam, {
                reason: reason.trim(),
                duration,
            });

            // Remove user from ALL servers they are in
            const serverMemberships = await serverMemberRepo.findAllByUserId(
                targetUser._id.toString(),
            );
            const io = getIO();

            for (const membership of serverMemberships) {
                await serverMemberRepo.deleteById(membership._id.toString());
                io.to(`server:${membership.serverId}`).emit(
                    'server_member_left',
                    {
                        serverId: membership.serverId,
                        userId: targetUser.username || '',
                    },
                );
            }

            // Notify and disconnect user if online
            const sockets = presenceService.getSockets(
                targetUser.username || '',
            );
            if (sockets && sockets.length > 0) {
                sockets.forEach((sid) => {
                    io.to(sid).emit('ban', {
                        reason: reason.trim(),
                        issuedBy: authReq.user.username,
                        expirationTimestamp,
                    });
                    io.sockets.sockets.get(sid)?.disconnect(true);
                });
            }

            res.json(ban);
        } catch (error) {
            logger.error('[ADMIN] Failed to ban user:', error);
            res.status(500).json({ error: 'Failed to ban user' });
        }
    },
);

// Unban User
router.post(
    '/users/:id/unban',
    requireAdmin('banUsers'),
    validate({ params: userIdParamSchema }),
    async (req, res) => {
        try {
            const authReq = req as AuthenticatedRequest;
            const userId = req.params.id as string;
            await banRepo.deactivateAllForUser(userId);
            await logAdminAction(authReq, 'unban_user', userId);
            res.json({ message: 'User unbanned' });
        } catch (error) {
            res.status(500).json({ error: 'Failed to unban user' });
        }
    },
);

// Get User Ban History
router.get('/users/:id/bans', requireAdmin('banUsers'), async (req, res) => {
    try {
        const ban = await banRepo.findByUserIdWithHistory(
            req.params.id as string,
        );
        if (!ban || !ban.history || ban.history.length === 0) {
            return res.json([]);
        }
        // Return the history array with active status computed for each entry
        const historyWithStatus = ban.history!.map(
            (entry: any, index: number) => ({
                _id: entry._id,
                reason: entry.reason,
                timestamp: entry.timestamp,
                expirationTimestamp: entry.expirationTimestamp,
                issuedBy: entry.issuedBy,
                active: index === ban.history!.length - 1 && ban.active, // Only the latest is active if ban is active
            }),
        );
        res.json(historyWithStatus);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get bans' });
    }
});

// List All Bans
router.get('/bans', requireAdmin('viewBans'), async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;
        const bans = await banRepo.findAll({
            limit: Number(limit),
            offset: Number(offset),
        });
        res.json(bans);
    } catch (error) {
        logger.error('[ADMIN] Failed to list bans:', error);
        res.status(500).json({ error: 'Failed to list bans' });
    }
});

// Diagnostic endpoint to check bans collection
router.get('/bans/diagnostic', requireAdmin('viewBans'), async (req, res) => {
    try {
        // Check app-level bans
        const appBansCount = await Ban.countDocuments();
        const appBansSample = await Ban.find({}).limit(5).lean();

        // Check server-level bans
        const serverBansCount = await ServerBan.countDocuments();
        const serverBansSample = await ServerBan.find({}).limit(5).lean();

        res.json({
            appBans: {
                count: appBansCount,
                sample: appBansSample,
            },
            serverBans: {
                count: serverBansCount,
                sample: serverBansSample,
            },
        });
    } catch (error) {
        logger.error('[ADMIN] Failed to get bans diagnostic:', error);
        res.status(500).json({ error: 'Failed to get diagnostic' });
    }
});

// Warn User
router.post(
    '/users/:id/warn',
    requireAdmin('warnUsers'),
    validate({ params: userIdParamSchema, body: warnUserSchema }),
    async (req, res) => {
        try {
            const authReq = req as AuthenticatedRequest;
            const { message } = req.body;
            const userId = req.params.id as string;

            const warning = await warningRepo.create({
                userId,
                issuedBy: authReq.user.id,
                message,
            });

            await logAdminAction(authReq, 'warn_user', userId, {
                reason: message,
            });

            // Notify user if online
            const user = await userRepo.findById(userId);
            if (user) {
                const sockets = presenceService.getSockets(user.username || '');
                if (sockets) {
                    const io = getIO();
                    sockets.forEach((sid) => {
                        io.to(sid).emit('warning', warning);
                    });
                }
            }

            res.json(warning);
        } catch (error) {
            res.status(500).json({ error: 'Failed to warn user' });
        }
    },
);

// Get User Warnings
router.get(
    '/users/:id/warnings',
    requireAdmin('warnUsers'),
    async (req, res) => {
        try {
            const warnings = await warningRepo.findByUserId(
                req.params.id as string,
            );
            res.json(warnings);
        } catch (error) {
            res.status(500).json({ error: 'Failed to get warnings' });
        }
    },
);

// List All Warnings
router.get('/warnings', requireAdmin('warnUsers'), async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;
        const warnings = await warningRepo.findAll({
            limit: Number(limit),
            offset: Number(offset),
        });
        res.json(warnings);
    } catch (error) {
        logger.error('[ADMIN] Failed to list warnings:', error);
        res.status(500).json({ error: 'Failed to list warnings' });
    }
});

// List Audit Logs
router.get('/logs', requireAdmin('viewLogs'), async (req, res) => {
    try {
        const { limit = 100, offset = 0 } = req.query;
        const logs = await auditLogRepo.find({
            limit: Number(limit),
            offset: Number(offset),
        });
        res.json(logs);
    } catch (error) {
        logger.error('[ADMIN] Failed to list audit logs:', error);
        res.status(500).json({ error: 'Failed to list audit logs' });
    }
});

// List Servers
router.get('/servers', requireAdmin('manageServer'), async (req, res) => {
    try {
        const { limit = 50, offset = 0, search } = req.query;
        const servers = await serverRepo.findMany({
            limit: Number(limit),
            offset: Number(offset),
            search: search as string,
            includeDeleted: true, // Admins can see deleted servers
        });

        // Collect all owner IDs and filter out invalid ones
        const ownerIds = [...new Set(servers.map((s) => s.ownerId))].filter((id) =>
            mongoose.Types.ObjectId.isValid(id.toString()),
        );
        const owners = await userRepo.findByIds(ownerIds);

        // Map servers to include owner details
        const enrichedServers = servers.map((server) => {
            const owner = owners.find(
                (u) => u._id.toString() === server.ownerId.toString(),
            );
            return {
                ...server,
                icon: server.icon ? `${server.icon}` : null,
                owner: owner
                    ? {
                        _id: owner._id,
                        username: owner.username,
                        displayName: owner.displayName,
                        profilePicture: owner.profilePicture
                            ? `/api/v1/profile/picture/${owner.profilePicture}`
                            : null,
                    }
                    : null,
            };
        });

        res.json(enrichedServers);
    } catch (error) {
        logger.error('[ADMIN] Failed to list servers:', error);
        res.status(500).json({ error: 'Failed to list servers' });
    }
});

// Delete Server
router.delete(
    '/servers/:serverId',
    requireAdmin('manageServer'),
    validate({ params: serverIdParamSchema }),
    async (req, res) => {
        try {
            const authReq = req as AuthenticatedRequest;
            const serverId = req.params.serverId as string;
            const server = await serverRepo.findById(serverId, true);
            if (!server) {
                return res.status(404).json({ error: 'Server not found' });
            }

            await serverRepo.softDelete(serverId);

            const io = getIO();
            io.to(`server:${serverId}`).emit('server_deleted', { serverId });

            await logAdminAction(
                authReq,
                'delete_server',
                server.ownerId.toString(),
                { serverId, serverName: server.name },
            );

            res.json({ message: 'Server deleted' });
        } catch (error) {
            logger.error('[ADMIN] Failed to delete server:', error);
            res.status(500).json({ error: 'Failed to delete server' });
        }
    },
);

// Restore Server
router.post(
    '/servers/:serverId/restore',
    requireAdmin('manageServer'),
    validate({ params: serverIdParamSchema }),
    async (req, res) => {
        try {
            const authReq = req as AuthenticatedRequest;
            const serverId = req.params.serverId as string;
            const server = await serverRepo.findById(serverId, true);

            if (!server) {
                return res.status(404).json({ error: 'Server not found' });
            }

            if (!server.deletedAt) {
                return res.status(400).json({ error: 'Server is not deleted' });
            }

            await serverRepo.restore(serverId);

            await logAdminAction(
                authReq,
                'restore_server',
                server.ownerId.toString(),
                { serverId, serverName: server.name },
            );

            res.json({ message: 'Server restored' });
        } catch (error) {
            logger.error('[ADMIN] Failed to restore server:', error);
            res.status(500).json({ error: 'Failed to restore server' });
        }
    },
);

// Get User Details
router.get(
    '/users/:id/details',
    requireAdmin('viewUsers'),
    validate({ params: userIdParamSchema }),
    async (req, res) => {
        try {
            const userId = req.params.id as string;
            const user = await userRepo.findById(userId);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            const profilePictureUrl = user.deletedAt
                ? '/images/deleted-cat.jpg'
                : user.profilePicture
                    ? `/api/v1/profile/picture/${user.profilePicture}`
                    : null;

            // Fetch servers user is in
            const memberships = await serverMemberRepo.findByUserId(userId);
            const serverIds = memberships.map((m) => m.serverId.toString());
            const servers = await serverRepo.findByIds(serverIds);

            // Map servers to include joinedAt and role info if needed
            const serverList = servers.map((server) => {
                const membership = memberships.find(
                    (m) => m.serverId.toString() === server._id.toString(),
                );
                return {
                    _id: server._id,
                    name: server.name,
                    icon: server.icon ? `${server.icon}` : null,
                    ownerId: server.ownerId,
                    joinedAt: membership?.joinedAt,
                    isOwner: server.ownerId.toString() === userId,
                };
            });

            const userDetails = {
                _id: user._id,
                username: user.username,
                displayName: user.displayName,
                email: user.login,
                profilePicture: profilePictureUrl,
                createdAt: user.createdAt,
                permissions: user.permissions,
                badges: user.badges,
                bio: user.bio,
                pronouns: user.pronouns,
                servers: serverList,
                // bans,
                // warnings
            };

            res.json(userDetails);
        } catch (error) {
            logger.error('[ADMIN] Failed to fetch user details:', error);
            res.status(500).json({ error: 'Failed to fetch user details' });
        }
    },
);

// Reset User Profile Fields
router.post(
    '/users/:id/reset',
    requireAdmin('manageUsers'),
    validate({ params: userIdParamSchema, body: resetProfileSchema }),
    async (req, res) => {
        try {
            const authReq = req as AuthenticatedRequest;
            const userId = req.params.id as string;
            const { fields } = req.body;
            const user = await userRepo.findById(userId);

            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            const updates: any = {};
            const oldUsername = user.username;

            if (fields.includes('username')) {
                const randomHex = crypto.randomBytes(8).toString('hex');
                updates.username = `user_${randomHex}`;
            }
            if (fields.includes('displayName')) {
                updates.displayName = '';
            }
            if (fields.includes('pronouns')) {
                updates.pronouns = '';
            }
            if (fields.includes('bio')) {
                updates.bio = '';
            }

            await userRepo.update(userId, updates);
            await logAdminAction(authReq, 'reset_profile_fields', userId, {
                fields,
            });

            // If username was changed, notify friends and disconnect user to force re-login/refresh
            if (updates.username) {
                const io = getIO();
                const friendships =
                    await friendshipRepo.findAllByUserId(userId);

                for (const friendship of friendships) {
                    const friendUsername =
                        friendship.userId?.toString() === userId
                            ? friendship.friend
                            : friendship.user;

                    const friendUser = await userRepo.findByUsername(
                        friendUsername || '',
                    );
                    if (friendUser) {
                        const sockets = presenceService.getSockets(
                            friendUser.username || '',
                        );
                        if (sockets) {
                            sockets.forEach((socketId) => {
                                io.to(socketId).emit('user_updated', {
                                    userId,
                                    username: updates.username,
                                    oldUsername,
                                });
                            });
                        }
                    }
                }

                // Disconnect the user to force them to re-authenticate with new username if needed
                // or at least refresh their state.
                const userSockets = presenceService.getSockets(
                    oldUsername || '',
                );
                if (userSockets) {
                    userSockets.forEach((socketId) => {
                        io.to(socketId).emit('force_logout', {
                            reason: 'Your username has been reset by an administrator.',
                        });
                        io.sockets.sockets.get(socketId)?.disconnect(true);
                    });
                }
            }

            res.json({
                message: 'Profile fields reset successfully',
                updatedFields: updates,
            });
        } catch (error) {
            logger.error('[ADMIN] Failed to reset profile fields:', error);
            res.status(500).json({ error: 'Failed to reset profile fields' });
        }
    },
);

// Mount badge routes

router.use('/', badgeRoutes);

// Mount invite routes
router.use('/invites', inviteRoutes);

export default router;
