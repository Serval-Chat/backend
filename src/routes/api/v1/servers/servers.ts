/**
 * To anyone reading this: im sorry for having this huge piece of shit. I was too lazy to make it better. :p
 */

import { Router } from 'express';
import {
    authenticateToken,
    type AuthenticatedRequest,
} from '../../../../middleware/auth';
import mongoose from 'mongoose';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import logger from '../../../../utils/logger';
import { getIO } from '../../../../socket';
import type { SerializedCustomStatus } from '../../../../utils/status';
import { resolveSerializedCustomStatus } from '../../../../utils/status';
import webhooksRoutes from './webhooks';
import emojisRoutes from './emojis';
import { validate } from '../../../../validation/middleware';
import {
    serverIdParamSchema,
    createServerSchema,
    updateServerSchema,
    createChannelSchema,
    updateChannelSchema,
    createRoleSchema,
    updateRoleSchema,
    createInviteSchema,
    joinServerSchema,
    kickMemberSchema,
    banMemberSchema,
    serverMessageSchema,
    editServerMessageSchema,
    serverMessagesQuerySchema,
    serverChannelIdParamSchema,
    serverMembersSearchQuerySchema,
    transferOwnershipSchema,
    reorderRolesSchema,
    userIdParamSchema,
    roleIdParamSchema,
    inviteIdParamSchema,
    serverInviteIdParamSchema,
    serverRoleIdParamSchema,
    serverUserIdRoleIdParamSchema,
    messageIdParamSchema,
    serverChannelMessageIdParamSchema,
    inviteCodeParamSchema,
    codeOrPathParamSchema,
    createCategorySchema,
    updateCategorySchema,
    serverCategoryIdParamSchema,
    reorderCategoriesSchema,
    updateChannelCategorySchema,
} from '../../../../validation/schemas/servers';
import { memoryUpload } from '../../../../config/multer';
import { container } from '../../../../di/container';
import { TYPES } from '../../../../di/types';
import type { IServerRepository } from '../../../../di/interfaces/IServerRepository';
import type { IServerMemberRepository } from '../../../../di/interfaces/IServerMemberRepository';
import type { IChannelRepository } from '../../../../di/interfaces/IChannelRepository';
import type { IRoleRepository } from '../../../../di/interfaces/IRoleRepository';
import type { IUserRepository } from '../../../../di/interfaces/IUserRepository';
import type { IInviteRepository } from '../../../../di/interfaces/IInviteRepository';
import type { IServerMessageRepository } from '../../../../di/interfaces/IServerMessageRepository';
import type { IServerBanRepository } from '../../../../di/interfaces/IServerBanRepository';
import type { IServerChannelReadRepository } from '../../../../di/interfaces/IServerChannelReadRepository';
import type { ICategoryRepository } from '../../../../di/interfaces/ICategoryRepository';
import type { IReactionRepository } from '../../../../di/interfaces/IReactionRepository';
import type { PermissionService } from '../../../../services/PermissionService';
import { ServerChannelRead } from '../../../../models/ServerChannelRead';

const router = Router();
const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'servers');

// Get repositories from DI container
const serverRepo = container.get<IServerRepository>(TYPES.ServerRepository);
const serverMemberRepo = container.get<IServerMemberRepository>(
    TYPES.ServerMemberRepository,
);
const channelRepo = container.get<IChannelRepository>(TYPES.ChannelRepository);
const roleRepo = container.get<IRoleRepository>(TYPES.RoleRepository);
const userRepo = container.get<IUserRepository>(TYPES.UserRepository);
const inviteRepo = container.get<IInviteRepository>(TYPES.InviteRepository);
const serverMessageRepo = container.get<IServerMessageRepository>(
    TYPES.ServerMessageRepository,
);
const serverBanRepo = container.get<IServerBanRepository>(
    TYPES.ServerBanRepository,
);
const serverChannelReadRepo = container.get<IServerChannelReadRepository>(
    TYPES.ServerChannelReadRepository,
);
const categoryRepo = container.get<ICategoryRepository>(
    TYPES.CategoryRepository,
);
const reactionRepo = container.get<IReactionRepository>(
    TYPES.ReactionRepository,
);
const permissionService = container.get<PermissionService>(
    TYPES.PermissionService,
);

/**
 * GET /
 * List all servers the authenticated user is a member of.
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { user } = req as AuthenticatedRequest;
        const userId = user.id;
        if (!userId) {
            return res.status(401).json({ error: 'unauthorized' });
        }

        const memberships = await serverMemberRepo.findByUserId(userId);

        const serverIds = memberships.map((m) => m.serverId.toString());
        const servers = await serverRepo.findByIds(serverIds);

        res.json(servers);
    } catch (err: any) {
        logger.error('Failed to get servers:', err);
        res.status(500).json({ error: 'Failed to get servers' });
    }
});

/**
 * POST /
 * Create a new server.
 *
 * Automatically creates:
 * - Default '@everyone' role
 * - Default 'general' text channel
 * - Adds creator as owner/member
 */
router.post(
    '/',
    authenticateToken,
    validate({ body: createServerSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const userId = user.id;
            const username = req.user?.username;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }

            const { name } = req.body;

            if (!name || name.trim().length === 0) {
                return res
                    .status(400)
                    .json({ error: 'Server name is required' });
            }

            const server = await serverRepo.create({
                name: name.trim(),
                ownerId: userId,
            });

            // Create default role (@everyone)
            const everyoneRole = await roleRepo.create({
                serverId: server._id.toString(),
                name: '@everyone',
                color: '#99aab5',
                position: 0,
                permissions: {
                    sendMessages: true,
                    manageMessages: false,
                    manageChannels: false,
                    manageRoles: false,
                    banMembers: false,
                    kickMembers: false,
                    manageInvites: false,
                    manageServer: false,
                    administrator: false,
                    pingRolesAndEveryone: false,
                    addReactions: true,
                },
            });

            // Create default channel
            const channel = await channelRepo.create({
                serverId: server._id.toString(),
                name: 'general',
                type: 'text',
                position: 0,
            });

            // Add owner as member
            await serverMemberRepo.create({
                serverId: server._id.toString(),
                userId: userId,
                roles: [],
            });

            res.json({ server, channel });
        } catch (err: any) {
            logger.error('Failed to create server:', err);
            res.status(500).json({ error: 'Failed to create server' });
        }
    },
);

// Get unread status for all servers
router.get('/unread', authenticateToken, async (req, res) => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'unauthorized' });
        }

        const memberships = await serverMemberRepo.findByUserId(userId);
        const serverIds = memberships.map((m) => m.serverId.toString());

        if (serverIds.length === 0) {
            return res.json({});
        }

        const channels = await channelRepo.findByServerIds(serverIds);
        const reads = await serverChannelReadRepo.findByUserId(userId);

        // Map channelId -> lastReadAt
        const readMap = new Map<string, Date>();
        reads.forEach((read) => {
            readMap.set(read.channelId, read.lastReadAt);
        });

        const unreadMap: Record<string, boolean> = {};

        // Initialize all to false
        serverIds.forEach((id) => (unreadMap[id] = false));

        for (const channel of channels) {
            const serverId = channel.serverId.toString();
            // If already marked unread, skip
            if (unreadMap[serverId]) continue;

            const lastMessageAt = channel.lastMessageAt;
            if (!lastMessageAt) continue; // No messages ever

            const lastReadAt = readMap.get(channel._id.toString());

            // If never read, it's unread (assuming there are messages)
            // Or if last message is newer than last read
            if (!lastReadAt || new Date(lastMessageAt) > new Date(lastReadAt)) {
                unreadMap[serverId] = true;
            }
        }

        res.json(unreadMap);
    } catch (err: any) {
        logger.error('Failed to get unread status:', err);
        res.status(500).json({ error: 'Failed to get unread status' });
    }
});

// Get all servers the authenticated user is a member of, including their membership details
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const { user } = req as AuthenticatedRequest;
        const userId = user.id;
        if (!userId) {
            return res.status(401).json({ error: 'unauthorized' });
        }

        const memberships = await serverMemberRepo.findByUserId(userId);
        const serverIds = memberships.map((m) => m.serverId.toString());

        const servers = await serverRepo.findByIds(serverIds);

        const response = servers.map((server) => {
            const membership = memberships.find(
                (m) => m.serverId.toString() === server._id.toString(),
            );
            return {
                server,
                membership: {
                    _id: membership?._id.toString(),
                    userId: membership?.userId.toString(),
                    serverId: membership?.serverId.toString(),
                    roles: membership?.roles.map((r) => r.toString()) || [],
                    joinedAt: membership?.joinedAt,
                },
            };
        });

        res.json(response);
    } catch (err: any) {
        logger.error('Failed to get user servers:', err);
        res.status(500).json({ error: 'Failed to get user servers' });
    }
});

// Get server details

// Mark all channels in a server as read
router.post(
    '/:serverId/read',
    authenticateToken,
    validate({ params: serverIdParamSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const userId = user.id;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }

            const { serverId } = req.params as { serverId: string };

            // Verify membership
            const member = await serverMemberRepo.findByServerAndUser(
                serverId,
                userId,
            );
            if (!member) {
                return res
                    .status(403)
                    .json({ error: 'Not a member of this server' });
            }

            // Get all channels
            const channels = await channelRepo.findByServerId(serverId);

            if (channels.length > 0) {
                const operations = channels.map((channel) => ({
                    updateOne: {
                        filter: {
                            serverId,
                            channelId: channel._id.toString(),
                            userId: new mongoose.Types.ObjectId(userId),
                        } as any,
                        update: { $set: { lastReadAt: new Date() } },
                        upsert: true,
                    },
                }));

                await ServerChannelRead.bulkWrite(operations);
            }

            res.json({ message: 'Server marked as read' });
        } catch (err: any) {
            logger.error('Failed to mark server as read:', err);
            res.status(500).json({ error: 'Failed to mark server as read' });
        }
    },
);

router.get(
    '/:serverId',
    authenticateToken,
    validate({ params: serverIdParamSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const userId = user.id;
            const username = (req as any).user?.username;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }

            const { serverId } = req.params as { serverId: string };

            const member = await serverMemberRepo.findByServerAndUser(
                serverId,
                userId,
            );
            if (!member) {
                return res
                    .status(403)
                    .json({ error: 'Not a member of this server' });
            }

            const server = await serverRepo.findById(serverId);
            if (!server) {
                return res.status(404).json({ error: 'Server not found' });
            }

            res.json(server);
        } catch (err: any) {
            logger.error('Failed to get server:', err);
            res.status(500).json({ error: 'Failed to get server' });
        }
    },
);

// Get server statistics (online users, total users, and extended stats)
router.get(
    '/:serverId/audit-logs/search',
    authenticateToken,
    validate({ params: serverIdParamSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const userId = user.id;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }

            const { serverId } = req.params as { serverId: string };
        } catch (err: any) {
            logger.error('Failed to get server stats:', err);
            res.status(500).json({ error: 'Failed to get server stats' });
        }
    },
);

// Get server statistics (online users, total users, and extended stats)
router.get(
    '/:serverId/stats',
    authenticateToken,
    validate({ params: serverIdParamSchema }),
    async (req, res) => {
        try {
            const userId = (req as any).user?.id as string;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }

            const { serverId } = req.params as { serverId: string };

            const member = await serverMemberRepo.findByServerAndUser(
                serverId,
                userId,
            );
            if (!member) {
                return res
                    .status(403)
                    .json({ error: 'Not a member of this server' });
            }

            // Get server details
            const server = await serverRepo.findById(serverId);
            if (!server) {
                return res.status(404).json({ error: 'Server not found' });
            }

            // Get all members
            const members = await serverMemberRepo.findByServerId(serverId);
            const totalCount = members.length;

            // Fetch user data to get usernames
            const userIds = members.map((m) => m.userId.toString());
            const users = await userRepo.findByIds(userIds);
            const userMap = new Map(users.map((u) => [u._id.toString(), u]));

            // Get PresenceService from container
            const { PresenceService } = await import(
                '../../../../realtime/services/PresenceService'
            );
            const presenceService = container.get<any>(TYPES.PresenceService);
            const onlineUsernames = new Set(
                presenceService.getAllOnlineUsers(),
            );

            // Count how many server members are online
            let onlineCount = 0;
            for (const m of members) {
                const user = userMap.get(m.userId.toString());
                if (user?.username && onlineUsernames.has(user.username)) {
                    onlineCount++;
                }
            }

            // Get banned user count
            const bannedUsers = await serverBanRepo.findByServerId(serverId);
            const bannedUserCount = bannedUsers.length;

            // Get owner name
            const owner = await userRepo.findById(server.ownerId.toString());
            const ownerName =
                owner?.displayName || owner?.username || 'Unknown';

            // Get newest member (most recent joinedAt)
            const sortedMembers = [...members].sort((a, b) => {
                const dateA = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
                const dateB = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
                return dateB - dateA;
            });
            const newestMemberId = sortedMembers[0]?.userId.toString();
            const newestMemberUser = newestMemberId
                ? userMap.get(newestMemberId)
                : null;
            const newestMember =
                newestMemberUser?.displayName ||
                newestMemberUser?.username ||
                'Unknown';

            // Get channel count
            const channels = await channelRepo.findByServerId(serverId);
            const channelCount = channels.length;

            // Get emoji count
            const Emoji = mongoose.model('Emoji');
            const emojiCount = await Emoji.countDocuments({ serverId }).exec();

            // All-time high tracking - update if current online count exceeds record
            let allTimeHigh = server.allTimeHigh || 0;
            if (onlineCount > allTimeHigh) {
                allTimeHigh = onlineCount;
                await serverRepo.update(serverId, { allTimeHigh });
            }

            res.json({
                onlineCount,
                totalCount,
                bannedUserCount,
                serverId: server._id.toString(),
                serverName: server.name,
                ownerName,
                createdAt:
                    server.createdAt?.toISOString() || new Date().toISOString(),
                allTimeHigh,
                newestMember,
                channelCount,
                emojiCount,
            });
        } catch (err: any) {
            logger.error('Failed to get server stats:', err);
            res.status(500).json({ error: 'Failed to get server stats' });
        }
    },
);

// Get channel statistics
router.get(
    '/:serverId/channels/:channelId/stats',
    authenticateToken,
    validate({ params: serverChannelIdParamSchema }),
    async (req, res) => {
        try {
            const userId = (req as any).user?.id as string;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }

            const { serverId, channelId } = req.params as {
                serverId: string;
                channelId: string;
            };

            // Check if user is a member
            const member = await serverMemberRepo.findByServerAndUser(
                serverId,
                userId,
            );
            if (!member) {
                return res
                    .status(403)
                    .json({ error: 'Not a member of this server' });
            }

            // Get channel data
            const channel = await channelRepo.findById(channelId);
            if (!channel) {
                return res.status(404).json({ error: 'Channel not found' });
            }

            if (channel.serverId !== serverId) {
                return res
                    .status(400)
                    .json({ error: 'Channel does not belong to this server' });
            }

            // Get message count
            const ServerMessage = mongoose.model('ServerMessage');
            const messageCount = await ServerMessage.countDocuments({
                channelId,
            }).exec();

            res.json({
                channelId: channel._id.toString(),
                channelName: channel.name,
                createdAt:
                    channel.createdAt?.toISOString() ||
                    new Date().toISOString(),
                messageCount,
            });
        } catch (err: any) {
            logger.error('Failed to get channel stats:', err);
            res.status(500).json({ error: 'Failed to get channel stats' });
        }
    },
);

// Update server
router.patch(
    '/:serverId',
    authenticateToken,
    validate({ params: serverIdParamSchema, body: updateServerSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const userId = user.id;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }
            const { serverId } = req.params as { serverId: string };
            const { name, banner, disableCustomFonts } = req.body;

            if (
                !(await permissionService.hasPermission(
                    serverId,
                    userId!,
                    'manageServer',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to manage server' });
            }

            const updates: any = {};
            if (name) updates.name = name;
            if (banner) updates.banner = banner;
            if (disableCustomFonts !== undefined)
                updates.disableCustomFonts = disableCustomFonts;

            const server = await serverRepo.update(serverId, updates);

            // Emit socket event to notify all server members about server update
            try {
                const io = getIO();
                io.to(`server:${serverId}`).emit('server_updated', {
                    serverId,
                    server,
                });
            } catch (err) {
                logger.error('Failed to emit server update:', err);
            }

            res.json(server);
        } catch (err: any) {
            logger.error('Failed to update server:', err);
            res.status(500).json({ error: 'Failed to update server' });
        }
    },
);

// Set default role for server
router.patch(
    '/:serverId/default-role',
    authenticateToken,
    validate({ params: serverIdParamSchema, body: updateServerSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const userId = user.id;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }
            const { serverId } = req.params as { serverId: string };
            const { roleId } = req.body; // null to clear default role

            if (
                !(await permissionService.hasPermission(
                    serverId,
                    userId!,
                    'manageServer',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to manage server' });
            }

            // If setting a role (not clearing)
            if (roleId) {
                const role = await roleRepo.findById(roleId);
                if (!role) {
                    return res.status(404).json({ error: 'Role not found' });
                }

                if (role.serverId.toString() !== serverId) {
                    return res
                        .status(400)
                        .json({ error: 'Role does not belong to this server' });
                }

                // Prevent @everyone from being set as default role
                if (
                    role.name &&
                    role.name.trim().toLowerCase() === '@everyone'
                ) {
                    return res.status(400).json({
                        error: 'Cannot set @everyone as default role',
                    });
                }
            }

            const server = await serverRepo.update(serverId, {
                defaultRoleId: roleId || null,
            });

            // Emit socket event to notify all server members
            try {
                const io = getIO();
                io.to(`server:${serverId}`).emit('server_updated', {
                    serverId,
                    server,
                });
            } catch (err) {
                logger.error('Failed to emit server update:', err);
            }

            res.json({ defaultRoleId: roleId || null });
        } catch (err: any) {
            logger.error('Failed to set default role:', err);
            res.status(500).json({ error: 'Failed to set default role' });
        }
    },
);

/**
 * DELETE /:serverId
 * Delete a server permanently.
 * Only the server owner can perform this action.
 */
router.delete(
    '/:serverId',
    authenticateToken,
    validate({ params: serverIdParamSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const username = user.username;
            const userId = user.id;
            const { serverId } = req.params as { serverId: string };

            const server = await serverRepo.findById(serverId);
            if (!server) {
                return res.status(404).json({ error: 'Server not found' });
            }

            if (server.ownerId.toString() !== userId) {
                return res
                    .status(403)
                    .json({ error: 'Only owner can delete server' });
            }

            await serverRepo.delete(serverId);
            await channelRepo.deleteByServerId(serverId);
            await serverMemberRepo.deleteByServerId(serverId);
            await roleRepo.deleteByServerId(serverId);
            await inviteRepo.deleteByServerId(serverId);
            await serverMessageRepo.deleteByServerId(serverId);

            // Emit socket event to notify all server members about server deletion
            try {
                const io = getIO();
                io.to(`server:${serverId}`).emit('server_deleted', {
                    serverId,
                });
            } catch (err) {
                logger.error('Failed to emit server deletion:', err);
            }

            res.json({ message: 'Server deleted' });
        } catch (err: any) {
            logger.error('Failed to delete server:', err);
            res.status(500).json({ error: 'Failed to delete server' });
        }
    },
);

/**
 * POST /:serverId/icon
 * Upload and update server icon.
 * Requires 'manageServer' permission.
 */
router.post(
    '/:serverId/icon',
    authenticateToken,
    validate({ params: serverIdParamSchema }),
    memoryUpload.single('icon'),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const username = user.username;
            const userId = user.id;
            const { serverId } = req.params as { serverId: string };

            if (
                !(await permissionService.hasPermission(
                    serverId,
                    userId!,
                    'manageServer',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to manage server' });
            }

            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            if (!fs.existsSync(UPLOADS_DIR)) {
                fs.mkdirSync(UPLOADS_DIR, { recursive: true });
            }

            const filename = `${serverId}-${Date.now()}.png`;
            const filepath = path.join(UPLOADS_DIR, filename);

            await sharp(req.file.buffer)
                .resize(256, 256, { fit: 'cover' })
                .png()
                .toFile(filepath);

            const iconUrl = `/api/v1/servers/icon/${filename}`;
            await serverRepo.update(serverId, { icon: iconUrl });

            // Emit socket event to notify all server members about icon update
            try {
                const io = getIO();
                io.to(`server:${serverId}`).emit('server_icon_updated', {
                    serverId,
                    icon: iconUrl,
                });
            } catch (err) {
                logger.error('Failed to emit server icon update:', err);
            }

            res.json({ icon: iconUrl });
        } catch (err: any) {
            logger.error('Failed to upload server icon:', err);
            res.status(500).json({ error: 'Failed to upload icon' });
        }
    },
);

// GET server icon
router.get('/icon/:filename', (req, res) => {
    try {
        const filename = req.params.filename as string;

        // Validate filename to prevent path traversal
        if (
            filename.includes('..') ||
            filename.includes('/') ||
            filename.includes('\\')
        ) {
            return res.status(400).json({ error: 'Invalid filename' });
        }

        const filepath = path.join(UPLOADS_DIR, filename);

        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: 'Icon not found' });
        }

        res.sendFile(filepath);
    } catch (err: any) {
        logger.error('Failed to get server icon:', err);
        res.status(500).json({ error: 'Failed to get icon' });
    }
});

/**
 * POST /:serverId/banner
 * Upload and update server banner image.
 * Requires 'manageServer' permission.
 */
router.post(
    '/:serverId/banner',
    authenticateToken,
    validate({ params: serverIdParamSchema }),
    memoryUpload.single('banner'),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const username = user.username;
            const userId = user.id;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }
            const { serverId } = req.params as { serverId: string };

            if (
                !(await permissionService.hasPermission(
                    serverId,
                    userId!,
                    'manageServer',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to manage server' });
            }

            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            if (!fs.existsSync(UPLOADS_DIR)) {
                fs.mkdirSync(UPLOADS_DIR, { recursive: true });
            }

            const ext = req.file.mimetype === 'image/gif' ? 'gif' : 'png';
            const filename = `${serverId}-banner-${Date.now()}.${ext}`;
            const filepath = path.join(UPLOADS_DIR, filename);

            if (ext === 'gif') {
                // Process GIF with sharp to sanitize (re-encode)
                // { animated: true } preserves animation if supported by the environment
                await sharp(req.file.buffer, { animated: true })
                    .resize(960, 540, { fit: 'cover' })
                    .gif()
                    .toFile(filepath);
            } else {
                // Process static images
                await sharp(req.file.buffer)
                    .resize(960, 540, { fit: 'cover' })
                    .png()
                    .toFile(filepath);
            }

            const bannerUrl = `/api/v1/servers/banner/${filename}`;
            await serverRepo.update(serverId, {
                banner: { type: 'image', value: bannerUrl },
            });

            // Emit socket event to notify all server members about banner update
            try {
                const io = getIO();
                io.to(`server:${serverId}`).emit('server_banner_updated', {
                    serverId,
                    banner: { type: 'image', value: bannerUrl },
                });
            } catch (err) {
                logger.error('Failed to emit server banner update:', err);
            }

            res.json({ banner: bannerUrl });
        } catch (err: any) {
            logger.error('Failed to upload server banner:', err);
            res.status(500).json({ error: 'Failed to upload banner' });
        }
    },
);

// GET server banner
router.get('/banner/:filename', (req, res) => {
    try {
        const filename = req.params.filename;

        // Reject empty filenames
        if (!filename || filename.trim() === '') {
            return res.status(400).json({ error: 'Invalid filename' });
        }

        // Resolve the full path
        const filepath = path.resolve(UPLOADS_DIR, filename);

        // Ensure the resolved path is inside the uploads directory
        if (!filepath.startsWith(UPLOADS_DIR + path.sep)) {
            return res.status(400).json({ error: 'Invalid filename' });
        }

        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: 'Banner not found' });
        }

        res.sendFile(filepath);
    } catch (err: any) {
        logger.error('Failed to get server banner:', err);
        res.status(500).json({ error: 'Failed to get banner' });
    }
});

// Get channels for a server
router.get(
    '/:serverId/channels',
    authenticateToken,
    validate({ params: serverIdParamSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const userId = user.id;
            const username = user.username;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }

            const { serverId } = req.params as { serverId: string };

            const member = await serverMemberRepo.findByServerAndUser(
                serverId,
                userId,
            );
            if (!member) {
                return res
                    .status(403)
                    .json({ error: 'Not a member of this server' });
            }

            const channels = await channelRepo.findByServerId(serverId);
            const reads = await serverChannelReadRepo.findByServerAndUser(
                serverId,
                userId,
            );
            const readMap = new Map<string, Date>();
            reads.forEach((read) => {
                if (read.channelId) {
                    readMap.set(read.channelId, read.lastReadAt);
                }
            });

            const response = channels.map((channel: any) => {
                const channelId = channel._id?.toString();
                const lastMessageAt: Date | null =
                    channel.lastMessageAt ?? null;
                const lastReadAt: Date | undefined = channelId
                    ? readMap.get(channelId)
                    : undefined;

                return {
                    ...channel,
                    lastMessageAt: lastMessageAt
                        ? lastMessageAt.toISOString()
                        : null,
                    lastReadAt: lastReadAt ? lastReadAt.toISOString() : null,
                };
            });

            res.json(response);
        } catch (err: any) {
            logger.error('Failed to get channels:', err);
            res.status(500).json({ error: 'Failed to get channels' });
        }
    },
);

/**
 * POST /:serverId/channels
 * Create a new channel in the server.
 * Requires 'manageChannels' permission.
 */
router.post(
    '/:serverId/channels',
    authenticateToken,
    validate({ params: serverIdParamSchema, body: createChannelSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const userId = user.id;
            const username = user.username;
            const { serverId } = req.params as { serverId: string };
            const {
                name,
                type = 'text',
                position,
                categoryId,
                description,
            } = req.body;

            if (!userId) {
                return res.status(403).json({ error: 'unauthorized' });
            }

            if (
                !(await permissionService.hasPermission(
                    serverId,
                    userId!,
                    'manageChannels',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to manage channels' });
            }

            const maxPositionChannel =
                await channelRepo.findMaxPositionByServerId(serverId);
            const finalPosition =
                position !== undefined
                    ? position
                    : maxPositionChannel
                      ? maxPositionChannel.position + 1
                      : 0;

            const channel = await channelRepo.create({
                serverId,
                name: name.trim(),
                type,
                position: finalPosition,
                categoryId: categoryId || null,
                permissions: {
                    everyone: { sendMessages: true },
                },
                ...(description && { description }),
            });

            // Emit socket event to notify all members
            const io = getIO();
            io.to(`server:${serverId}`).emit('channel_created', {
                serverId,
                channel,
            });

            res.json(channel);
        } catch (err: any) {
            logger.error('Failed to create channel:', err);
            res.status(500).json({ error: 'Failed to create channel' });
        }
    },
);

// Update channel positions (for reordering)
router.patch(
    '/:serverId/channels/reorder',
    authenticateToken,
    validate({ params: serverIdParamSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const username = user.username;
            const userId = user.id;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }
            const { serverId } = req.params as { serverId: string };
            const { channelPositions } = req.body; // Array of { channelId, position }

            if (
                !(await permissionService.hasPermission(
                    serverId,
                    userId!,
                    'manageChannels',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to manage channels' });
            }

            // Update all channel positions
            for (const { channelId, position } of channelPositions) {
                await channelRepo.update(channelId, { position });
            }

            // Emit socket event to notify all members
            const io = getIO();
            io.to(`server:${serverId}`).emit('channels_reordered', {
                serverId,
                channelPositions,
            });

            res.json({ message: 'Channels reordered' });
        } catch (err: any) {
            logger.error('Failed to reorder channels:', err);
            res.status(500).json({ error: 'Failed to reorder channels' });
        }
    },
);

// Delete a channel
router.delete(
    '/:serverId/channels/:channelId',
    authenticateToken,
    validate({ params: serverChannelIdParamSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const username = user.username;
            const userId = user.id;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }
            const { serverId, channelId } = req.params as {
                serverId: string;
                channelId: string;
            };

            if (
                !(await permissionService.hasPermission(
                    serverId,
                    userId!,
                    'manageChannels',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to manage channels' });
            }

            await channelRepo.delete(channelId);
            await serverMessageRepo.deleteByChannelId(channelId);

            // Emit socket event to notify all members
            const io = getIO();
            io.to(`server:${serverId}`).emit('channel_deleted', {
                serverId,
                channelId,
            });

            res.json({ message: 'Channel deleted' });
        } catch (err: any) {
            logger.error('Failed to delete channel:', err);
            res.status(500).json({ error: 'Failed to delete channel' });
        }
    },
);

// Update a channel
router.patch(
    '/:serverId/channels/:channelId',
    authenticateToken,
    validate({
        params: serverChannelIdParamSchema,
        body: updateChannelCategorySchema,
    }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const userId = user.id;
            const username = user.username;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }
            const { serverId, channelId } = req.params as {
                serverId: string;
                channelId: string;
            };
            const { name, position, categoryId, icon, description } = req.body;

            if (
                !(await permissionService.hasPermission(
                    serverId,
                    userId!,
                    'manageChannels',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to manage channels' });
            }

            const channel = await channelRepo.findById(channelId);
            if (!channel) {
                return res.status(404).json({ error: 'Channel not found' });
            }

            if (channel.serverId !== serverId) {
                return res
                    .status(400)
                    .json({ error: 'Channel does not belong to this server' });
            }

            // Validate categoryId if provided
            if (categoryId) {
                const category = await categoryRepo.findById(categoryId);
                if (!category) {
                    return res
                        .status(400)
                        .json({ error: 'Category not found' });
                }
                if (category.serverId !== serverId) {
                    return res.status(400).json({
                        error: 'Category does not belong to this server',
                    });
                }
            }

            const updates: any = {};
            if (name) updates.name = name.trim();
            if (position !== undefined) updates.position = position;
            if (categoryId !== undefined) updates.categoryId = categoryId;
            if (icon !== undefined) updates.icon = icon;
            if (description !== undefined) updates.description = description;

            const updatedChannel = await channelRepo.update(channelId, updates);

            // Emit socket event to notify all members
            const io = getIO();
            io.to(`server:${serverId}`).emit('channel_updated', {
                serverId,
                channel: updatedChannel,
            });

            res.json(updatedChannel);
        } catch (err: any) {
            logger.error('Failed to update channel:', err);
            res.status(500).json({ error: 'Failed to update channel' });
        }
    },
);

// Get permissions for a channel
router.get(
    '/:serverId/channels/:channelId/permissions',
    authenticateToken,
    validate({ params: serverChannelIdParamSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const userId = user.id;
            const username = user.username;
            const { serverId, channelId } = req.params as {
                serverId: string;
                channelId: string;
            };

            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }

            const member = await serverMemberRepo.findByServerAndUser(
                serverId,
                userId,
            );
            if (!member) {
                return res
                    .status(403)
                    .json({ error: 'Not a member of this server' });
            }

            if (
                !(await permissionService.hasPermission(
                    serverId,
                    userId!,
                    'manageChannels',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to manage channels' });
            }

            const channel = await channelRepo.findById(channelId);
            if (!channel) {
                return res.status(404).json({ error: 'Channel not found' });
            }

            res.json({ permissions: channel.permissions || {} });
        } catch (err: any) {
            logger.error('Failed to get channel permissions:', err);
            res.status(500).json({
                error: 'Failed to get channel permissions',
            });
        }
    },
);

// Update permissions for a channel
router.patch(
    '/:serverId/channels/:channelId/permissions',
    authenticateToken,
    validate({ params: serverChannelIdParamSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const username = user.username;
            const userId = user.id;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }
            const { serverId, channelId } = req.params as {
                serverId: string;
                channelId: string;
            };
            const { permissions } = req.body; // Map of roleId to permission overrides

            if (
                !(await permissionService.hasPermission(
                    serverId,
                    userId!,
                    'manageChannels',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to manage channels' });
            }

            const channel = await channelRepo.findById(channelId);
            if (!channel) {
                return res.status(404).json({ error: 'Channel not found' });
            }

            await channelRepo.update(channelId, {
                permissions: permissions || {},
            });

            // Emit socket event to notify all members
            const io = getIO();
            io.to(`server:${serverId}`).emit('channel_permissions_updated', {
                serverId,
                channelId,
                permissions: permissions || {},
            });

            res.json({ permissions: permissions || {} });
        } catch (err: any) {
            logger.error('Failed to update channel permissions:', err);
            res.status(500).json({
                error: 'Failed to update channel permissions',
            });
        }
    },
);

// GET /api/v1/servers/messages/:serverId/:channelId/:messageId
router.get(
    '/messages/:serverId/:channelId/:messageId',
    authenticateToken,
    validate({ params: serverChannelMessageIdParamSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const userId = user.id;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }

            const { serverId, channelId, messageId } = req.params as {
                serverId: string;
                channelId: string;
                messageId: string;
            };

            // Check server membership
            const member = await serverMemberRepo.findByServerAndUser(
                serverId,
                userId,
            );
            if (!member) {
                return res
                    .status(403)
                    .json({ error: 'Not a member of this server' });
            }

            // Check channel access (simplified: if member, usually can read unless private, but for now we assume basic access or check permissions if needed)
            // For strictness, we should check if user has 'viewChannel' or similar if implemented, but 'readMessages' is usually the one.
            // Reusing permissionService for 'sendMessages' or just assuming read access if member for now as per existing patterns or check 'viewChannel' if it exists.
            // Existing code checks 'manageChannels' for management. Reading usually just requires membership in public channels.
            // Let's assume if they are a member they can read for now, or check if channel exists.

            const channel = await channelRepo.findById(channelId);
            if (!channel) {
                return res.status(404).json({ error: 'Channel not found' });
            }

            if (channel.serverId.toString() !== serverId) {
                return res
                    .status(400)
                    .json({ error: 'Channel does not belong to this server' });
            }

            const message = await serverMessageRepo.findById(messageId);
            if (!message) {
                return res.status(404).json({ error: 'Message not found' });
            }

            if (message.channelId.toString() !== channelId) {
                return res
                    .status(400)
                    .json({ error: 'Message does not belong to this channel' });
            }

            // Fetch replied message if exists
            let repliedMessage = null;
            if (message.repliedToMessageId) {
                repliedMessage = await serverMessageRepo.findById(
                    message.repliedToMessageId.toString(),
                );
            } else if (message.replyToId) {
                // Fallback
                repliedMessage = await serverMessageRepo.findById(
                    message.replyToId.toString(),
                );
            }

            res.json({ message, repliedMessage });
        } catch (err: any) {
            logger.error('Failed to get message:', err);
            res.status(500).json({ error: 'Failed to get message' });
        }
    },
);

// ====================
// CATEGORY ROUTES
// ====================

// Get categories for a server
router.get(
    '/:serverId/categories',
    authenticateToken,
    validate({ params: serverIdParamSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const userId = user.id;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }

            const { serverId } = req.params as { serverId: string };

            const member = await serverMemberRepo.findByServerAndUser(
                serverId,
                userId,
            );
            if (!member) {
                return res
                    .status(403)
                    .json({ error: 'Not a member of this server' });
            }

            const categories = await categoryRepo.findByServerId(serverId);
            res.json(categories);
        } catch (err: any) {
            logger.error('Failed to get categories:', err);
            res.status(500).json({ error: 'Failed to get categories' });
        }
    },
);

// Create a category
router.post(
    '/:serverId/categories',
    authenticateToken,
    validate({ params: serverIdParamSchema, body: createCategorySchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const userId = user.id;
            const { serverId } = req.params as { serverId: string };
            const { name, position } = req.body;

            if (
                !(await permissionService.hasPermission(
                    serverId,
                    userId,
                    'manageChannels',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to manage channels' });
            }

            const maxPositionCategory =
                await categoryRepo.findMaxPositionByServerId(serverId);
            const finalPosition =
                position !== undefined
                    ? position
                    : maxPositionCategory
                      ? maxPositionCategory.position + 1
                      : 0;

            const category = await categoryRepo.create({
                serverId,
                name: name.trim(),
                position: finalPosition,
            });

            // Emit socket event to notify all members
            const io = getIO();
            io.to(`server:${serverId}`).emit('category_created', {
                serverId,
                category,
            });

            res.json(category);
        } catch (err: any) {
            logger.error('Failed to create category:', err);
            res.status(500).json({ error: 'Failed to create category' });
        }
    },
);

// Reorder categories
router.patch(
    '/:serverId/categories/reorder',
    authenticateToken,
    validate({ params: serverIdParamSchema, body: reorderCategoriesSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const userId = user.id;
            const { serverId } = req.params as { serverId: string };
            const { categoryPositions } = req.body;

            if (
                !(await permissionService.hasPermission(
                    serverId,
                    userId,
                    'manageChannels',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to manage channels' });
            }

            // Transform the data to match repository interface
            const updates = categoryPositions.map(
                ({
                    categoryId,
                    position,
                }: {
                    categoryId: string;
                    position: number;
                }) => ({
                    id: categoryId,
                    position,
                }),
            );

            await categoryRepo.updatePositions(updates);

            // Emit socket event to notify all members
            const io = getIO();
            io.to(`server:${serverId}`).emit('categories_reordered', {
                serverId,
                categoryPositions,
            });

            res.json({ message: 'Categories reordered' });
        } catch (err: any) {
            logger.error('Failed to reorder categories:', err);
            res.status(500).json({ error: 'Failed to reorder categories' });
        }
    },
);

// Update a category
router.patch(
    '/:serverId/categories/:categoryId',
    authenticateToken,
    validate({
        params: serverCategoryIdParamSchema,
        body: updateCategorySchema,
    }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const userId = user.id;
            const { serverId, categoryId } = req.params as {
                serverId: string;
                categoryId: string;
            };
            const { name, position } = req.body;

            if (
                !(await permissionService.hasPermission(
                    serverId,
                    userId,
                    'manageChannels',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to manage channels' });
            }

            const category = await categoryRepo.findByIdAndServer(
                categoryId,
                serverId,
            );
            if (!category) {
                return res.status(404).json({ error: 'Category not found' });
            }

            const updates: any = {};
            if (name) updates.name = name.trim();
            if (position !== undefined) updates.position = position;

            const updatedCategory = await categoryRepo.update(
                categoryId,
                updates,
            );

            // Emit socket event to notify all members
            const io = getIO();
            io.to(`server:${serverId}`).emit('category_updated', {
                serverId,
                category: updatedCategory,
            });

            res.json(updatedCategory);
        } catch (err: any) {
            logger.error('Failed to update category:', err);
            res.status(500).json({ error: 'Failed to update category' });
        }
    },
);

// Delete a category
router.delete(
    '/:serverId/categories/:categoryId',
    authenticateToken,
    validate({ params: serverCategoryIdParamSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const userId = user.id;
            const { serverId, categoryId } = req.params as {
                serverId: string;
                categoryId: string;
            };

            if (
                !(await permissionService.hasPermission(
                    serverId,
                    userId,
                    'manageChannels',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to manage channels' });
            }

            const category = await categoryRepo.findByIdAndServer(
                categoryId,
                serverId,
            );
            if (!category) {
                return res.status(404).json({ error: 'Category not found' });
            }

            // Move all channels in this category to no category (null)
            await channelRepo.updateChannelsInCategory(categoryId, {
                categoryId: null,
            });

            // Delete the category
            await categoryRepo.delete(categoryId);

            // Emit socket events to notify all members
            const io = getIO();
            io.to(`server:${serverId}`).emit('category_deleted', {
                serverId,
                categoryId,
            });

            res.json({ message: 'Category deleted' });
        } catch (err: any) {
            logger.error('Failed to delete category:', err);
            res.status(500).json({ error: 'Failed to delete category' });
        }
    },
);

// Get permissions for a category
router.get(
    '/:serverId/categories/:categoryId/permissions',
    authenticateToken,
    validate({ params: serverCategoryIdParamSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const userId = user.id;
            const { serverId, categoryId } = req.params as {
                serverId: string;
                categoryId: string;
            };

            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }

            const member = await serverMemberRepo.findByServerAndUser(
                serverId,
                userId,
            );
            if (!member) {
                return res
                    .status(403)
                    .json({ error: 'Not a member of this server' });
            }

            if (
                !(await permissionService.hasPermission(
                    serverId,
                    userId,
                    'manageChannels',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to manage channels' });
            }

            const category = await categoryRepo.findById(categoryId);
            if (!category) {
                return res.status(404).json({ error: 'Category not found' });
            }

            res.json({ permissions: category.permissions || {} });
        } catch (err: any) {
            logger.error('Failed to get category permissions:', err);
            res.status(500).json({
                error: 'Failed to get category permissions',
            });
        }
    },
);

// Update permissions for a category
router.patch(
    '/:serverId/categories/:categoryId/permissions',
    authenticateToken,
    validate({ params: serverCategoryIdParamSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const userId = user.id;
            const { serverId, categoryId } = req.params as {
                serverId: string;
                categoryId: string;
            };
            const { permissions } = req.body;

            if (
                !(await permissionService.hasPermission(
                    serverId,
                    userId,
                    'manageChannels',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to manage channels' });
            }

            const category = await categoryRepo.findById(categoryId);
            if (!category) {
                return res.status(404).json({ error: 'Category not found' });
            }

            await categoryRepo.update(categoryId, {
                permissions: permissions || {},
            });

            // Emit socket event to notify all members
            const io = getIO();
            io.to(`server:${serverId}`).emit('category_permissions_updated', {
                serverId,
                categoryId,
                permissions: permissions || {},
            });

            res.json({ permissions: permissions || {} });
        } catch (err: any) {
            logger.error('Failed to update category permissions:', err);
            res.status(500).json({
                error: 'Failed to update category permissions',
            });
        }
    },
);

// ====================
// END CATEGORY ROUTES
// ====================

// Get members of a server
router.get(
    '/:serverId/members',
    authenticateToken,
    validate({ params: serverIdParamSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const username = user.username;
            const userId = user.id;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }
            const { serverId } = req.params as { serverId: string };

            const member = await serverMemberRepo.findByServerAndUser(
                serverId,
                userId,
            );
            if (!member) {
                return res
                    .status(403)
                    .json({ error: 'Not a member of this server' });
            }

            const members = await serverMemberRepo.findByServerId(serverId);
            const userIds = members.map((m) => m.userId.toString());

            // Select deletedAt and anonymizedUsername to compute displayUsername virtual
            const users = await userRepo.findByIds(userIds);

            const membersWithUsers = members.map((m) => {
                const user = users.find(
                    (u) => u._id?.toString() === m.userId.toString(),
                );

                if (!user) {
                    return {
                        _id: m._id?.toString(),
                        serverId: m.serverId.toString(),
                        userId: m.userId.toString(),
                        roles: m.roles.map((r: any) => r.toString()),
                        joinedAt: m.joinedAt,
                        user: null,
                    };
                }

                // Manually compute displayUsername for deleted users
                const displayUsername =
                    user.deletedAt && user.anonymizedUsername
                        ? user.anonymizedUsername
                        : user.username;

                const userPayload: any = {
                    username: user.username,
                    profilePicture: user.profilePicture
                        ? `/api/v1/profile/picture/${user.profilePicture}`
                        : null,
                    usernameFont: user.usernameFont,
                    usernameGradient: user.usernameGradient,
                    usernameGlow: user.usernameGlow,
                    customStatus: resolveSerializedCustomStatus(
                        user.customStatus,
                    ) as SerializedCustomStatus | null,
                };

                // Only include displayName if user actually has one (not null/undefined/empty)
                if (user.displayName && user.displayName.trim()) {
                    userPayload.displayName = user.displayName;
                } else if (user.anonymizedUsername) {
                    userPayload.displayName = user.anonymizedUsername;
                }

                return {
                    _id: m._id?.toString(),
                    serverId: m.serverId.toString(),
                    userId: m.userId.toString(),
                    roles: m.roles.map((r: any) => r.toString()),
                    joinedAt: m.joinedAt,
                    user: userPayload,
                };
            });

            res.json(membersWithUsers);
        } catch (err: any) {
            logger.error('Failed to get members:', err);
            res.status(500).json({ error: 'Failed to get members' });
        }
    },
);

// Get a specific member of a server
router.get(
    '/:serverId/members/:userId',
    authenticateToken,
    validate({ params: serverIdParamSchema.merge(userIdParamSchema) }),
    async (req, res) => {
        try {
            const authUser = (req as AuthenticatedRequest).user;
            const username = authUser.username;
            const currentUserId = authUser.id;
            if (!currentUserId) {
                return res.status(401).json({ error: 'unauthorized' });
            }
            const { serverId, userId } = req.params as {
                serverId: string;
                userId: string;
            };

            // Check if requester is a member of the server
            const requesterMember = await serverMemberRepo.findByServerAndUser(
                serverId,
                currentUserId,
            );
            if (!requesterMember) {
                return res
                    .status(403)
                    .json({ error: 'Not a member of this server' });
            }

            const member = await serverMemberRepo.findByServerAndUser(
                serverId,
                userId,
            );
            if (!member) {
                return res.status(404).json({ error: 'Member not found' });
            }

            const user = await userRepo.findById(userId);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            // Manually compute displayUsername for deleted users
            const displayUsername =
                user.deletedAt && user.anonymizedUsername
                    ? user.anonymizedUsername
                    : user.username;

            const userPayload: any = {
                username: user.username,
                profilePicture: user.profilePicture
                    ? `/api/v1/profile/picture/${user.profilePicture}`
                    : null,
                usernameFont: user.usernameFont,
                usernameGradient: user.usernameGradient,
                usernameGlow: user.usernameGlow,
                customStatus: resolveSerializedCustomStatus(
                    user.customStatus,
                ) as SerializedCustomStatus | null,
            };

            // Only include displayName if user actually has one (not null/undefined/empty)
            if (user.displayName && user.displayName.trim()) {
                userPayload.displayName = user.displayName;
            } else if (user.anonymizedUsername) {
                userPayload.displayName = user.anonymizedUsername;
            }

            const memberWithUser = {
                _id: member._id?.toString(),
                serverId: member.serverId.toString(),
                userId: member.userId.toString(),
                roles: member.roles.map((r: any) => r.toString()),
                joinedAt: member.joinedAt,
                user: userPayload,
            };

            res.json(memberWithUser);
        } catch (err: any) {
            logger.error('Failed to get member:', err);
            res.status(500).json({ error: 'Failed to get member' });
        }
    },
);

// Search server members by username
router.get(
    '/:serverId/members/search',
    authenticateToken,
    validate({
        params: serverIdParamSchema,
        query: serverMembersSearchQuerySchema,
    }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const userId = user.id;
            const username = user.username;
            const { serverId } = req.params as { serverId: string };
            const { query } = req.query as { query: string };

            if (!query || typeof query !== 'string' || query.length < 2) {
                return res.json([]);
            }

            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }

            const member = await serverMemberRepo.findByServerAndUser(
                serverId,
                userId,
            );
            if (!member) {
                return res
                    .status(403)
                    .json({ error: 'Not a member of this server' });
            }

            // Search members by username (case-insensitive partial match)
            const members = await serverMemberRepo.findByServerId(serverId);
            const memberUserIds = members.map((m) => m.userId.toString());

            // Find users whose username starts with the query (case-insensitive)
            const users = await userRepo.findByUsernamePrefix(
                memberUserIds,
                query,
                3,
            );

            const membersWithUsers = users.map((user) => {
                const member = members.find(
                    (m) => m.userId.toString() === user._id?.toString(),
                );
                return {
                    userId: user._id?.toString(),
                    username: user.username,
                    profilePicture: user.profilePicture
                        ? `/api/v1/profile/picture/${user.profilePicture}`
                        : null,
                    joinedAt: member?.joinedAt,
                    roles: member?.roles || [],
                };
            });

            res.json(membersWithUsers);
        } catch (err: any) {
            logger.error('Failed to search members:', err);
            res.status(500).json({ error: 'Failed to search members' });
        }
    },
);

// Transfer server ownership
router.post(
    '/:serverId/transfer-ownership',
    authenticateToken,
    validate({ params: serverIdParamSchema, body: transferOwnershipSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const currentOwnerUsername = user.username;
            const currentOwnerUserId = user.id;
            const { serverId } = req.params as { serverId: string };
            const { newOwnerId } = req.body;

            if (!newOwnerId || typeof newOwnerId !== 'string') {
                logger.warn('Transfer ownership denied: missing new owner ID', {
                    serverId,
                    requestedBy: currentOwnerUsername,
                });
                return res
                    .status(400)
                    .json({ error: 'New owner ID is required' });
            }

            logger.info('Ownership transfer requested', {
                serverId,
                requestedBy: currentOwnerUsername,
                newOwnerId,
            });

            // Verify current user is the server owner
            const server = await serverRepo.findById(serverId);
            if (!server) {
                logger.warn('Transfer ownership denied: server not found', {
                    serverId,
                    requestedBy: currentOwnerUsername,
                    newOwnerId,
                });
                return res.status(404).json({ error: 'Server not found' });
            }

            if (server.ownerId.toString() !== currentOwnerUserId) {
                logger.warn(
                    'Transfer ownership denied: requester is not current owner',
                    {
                        serverId,
                        requestedBy: currentOwnerUsername,
                        serverOwnerId: server.ownerId.toString(),
                        newOwnerId,
                    },
                );
                return res.status(403).json({
                    error: 'Only the server owner can transfer ownership',
                });
            }

            // Verify new owner is a server member
            const newOwnerMember = await serverMemberRepo.findByServerAndUser(
                serverId,
                newOwnerId,
            );
            if (!newOwnerMember) {
                logger.warn(
                    'Transfer ownership denied: new owner is not a member',
                    {
                        serverId,
                        requestedBy: currentOwnerUsername,
                        newOwnerId,
                    },
                );
                return res
                    .status(400)
                    .json({ error: 'New owner must be a server member' });
            }

            // Cannot transfer to yourself
            if (newOwnerId === currentOwnerUserId) {
                logger.warn(
                    'Transfer ownership denied: attempted self-transfer',
                    {
                        serverId,
                        requestedBy: currentOwnerUsername,
                        newOwnerId,
                    },
                );
                return res
                    .status(400)
                    .json({ error: 'Cannot transfer ownership to yourself' });
            }

            // Update server ownership
            await serverRepo.update(serverId, { ownerId: newOwnerId });

            logger.info('Ownership transfer completed', {
                serverId,
                previousOwnerId: currentOwnerUsername,
                newOwnerId,
            });

            // Get new owner details for broadcasting
            const newOwnerUser = await userRepo.findById(newOwnerId);

            // Emit socket event to notify all server members
            const io = getIO();
            io.to(`server:${serverId}`).emit('server_ownership_transferred', {
                serverId,
                previousOwnerId: currentOwnerUsername,
                newOwnerId: newOwnerId,
                newOwnerUsername: newOwnerUser?.username,
                newOwnerProfilePicture: newOwnerUser?.profilePicture
                    ? `/api/v1/profile/picture/${newOwnerUser.profilePicture}`
                    : null,
                transferredAt: new Date(),
            });

            res.json({
                message: 'Ownership transferred successfully',
                previousOwnerId: currentOwnerUsername,
                newOwnerId: newOwnerId,
            });
        } catch (err: any) {
            logger.error('Failed to transfer ownership', {
                error: err,
                serverId: req.params.serverId,
                requestedBy: (req as AuthenticatedRequest).user.username,
                newOwnerId: req.body?.newOwnerId,
            });
            res.status(500).json({ error: 'Failed to transfer ownership' });
        }
    },
);

// Get roles for a server
router.get(
    '/:serverId/roles',
    authenticateToken,
    validate({ params: serverIdParamSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const username = user.username;
            const userId = user.id;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }
            const { serverId } = req.params as { serverId: string };

            const member = await serverMemberRepo.findByServerAndUser(
                serverId,
                userId,
            );
            if (!member) {
                return res
                    .status(403)
                    .json({ error: 'Not a member of this server' });
            }

            const roles = await roleRepo.findByServerId(serverId);
            res.json(roles);
        } catch (err: any) {
            logger.error('Failed to get roles:', err);
            res.status(500).json({ error: 'Failed to get roles' });
        }
    },
);

// Create a role
router.post(
    '/:serverId/roles',
    authenticateToken,
    validate({ params: serverIdParamSchema, body: createRoleSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const username = user.username;
            const currentUserId = user.id;
            if (!currentUserId) {
                return res.status(401).json({ error: 'unauthorized' });
            }
            const { serverId } = req.params as { serverId: string };
            const {
                name,
                color,
                startColor,
                endColor,
                colors,
                gradientRepeat,
                separateFromOtherRoles,
                permissions,
            } = req.body;

            // If gradient colors are provided, clear the solid color to indicate gradient mode
            const roleColor =
                startColor || endColor ? null : color || '#99aab5';

            if (
                !(await permissionService.hasPermission(
                    serverId,
                    currentUserId!,
                    'manageRoles',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to manage roles' });
            }

            // Check if a role with this name already exists in the server
            const existingRole = await roleRepo.findByServerIdAndName(
                serverId,
                name || 'New Role',
            );
            if (existingRole) {
                return res
                    .status(400)
                    .json({ error: 'A role with this name already exists' });
            }

            // Get user's highest role position to prevent creating roles above their level
            const server = await serverRepo.findById(serverId);
            const isOwner =
                server && server.ownerId.toString() === currentUserId;
            const userHighestPosition =
                await permissionService.getHighestRolePosition(
                    serverId,
                    currentUserId,
                );

            const maxPositionRole =
                await roleRepo.findMaxPositionByServerId(serverId);
            let position = maxPositionRole ? maxPositionRole.position + 1 : 1;

            // Non-owners cannot create roles at a position higher than their highest role
            if (!isOwner && position > userHighestPosition) {
                position = userHighestPosition; // Cap at user's highest position
            }

            const roleData: any = {
                serverId,
                name: name || 'New Role',
                color: roleColor,
                ...(startColor && { startColor }),
                ...(endColor && { endColor }),
                ...(colors && { colors }),
                ...(gradientRepeat && { gradientRepeat }),
                ...(separateFromOtherRoles !== undefined && {
                    separateFromOtherRoles,
                }),
                permissions:
                    permissions ||
                    (name &&
                    (name.toLowerCase().includes('mute') ||
                        name.toLowerCase().includes('muted'))
                        ? {
                              sendMessages: false,
                              manageMessages: false,
                              deleteMessagesOfOthers: false,
                              manageChannels: false,
                              manageRoles: false,
                              banMembers: false,
                              kickMembers: false,
                              manageInvites: false,
                              manageServer: false,
                              administrator: false,
                              pingRolesAndEveryone: false,
                          }
                        : {
                              sendMessages: true,
                              manageMessages: false,
                              deleteMessagesOfOthers: false,
                              manageChannels: false,
                              manageRoles: false,
                              banMembers: false,
                              kickMembers: false,
                              manageInvites: false,
                              manageServer: false,
                              administrator: false,
                              pingRolesAndEveryone: false,
                          }),
            };

            const role = await roleRepo.create({
                ...roleData,
                position,
            });

            // Emit socket event to notify all clients in the server
            try {
                const io = getIO();
                io.to(`server:${serverId}`).emit('role_created', {
                    serverId,
                    role,
                });
            } catch (err) {
                logger.error('Failed to emit role creation:', err);
            }

            res.json(role);
        } catch (err: any) {
            logger.error('Failed to create role:', err);
            res.status(500).json({ error: 'Failed to create role' });
        }
    },
);

// Reorder roles (MUST come before /:roleId route)
router.patch(
    '/:serverId/roles/reorder',
    authenticateToken,
    validate({ params: serverIdParamSchema, body: reorderRolesSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const userId = user.id;
            const username = user.username;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }
            const { serverId } = req.params as { serverId: string };
            const { rolePositions } = req.body as {
                rolePositions: { roleId: string; position: number }[];
            };

            if (
                !(await permissionService.hasPermission(
                    serverId,
                    userId!,
                    'manageRoles',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to manage roles' });
            }

            const server = await serverRepo.findById(serverId);
            const isOwner = server && server.ownerId.toString() === userId;

            // Check each role being reordered
            for (const { roleId, position } of rolePositions) {
                const role = await roleRepo.findById(roleId);
                if (!role) continue;

                // Prevent @everyone role from being reordered to any position other than 0
                if (
                    role.name &&
                    role.name.trim().toLowerCase() === '@everyone' &&
                    position !== 0
                ) {
                    return res
                        .status(403)
                        .json({ error: 'Cannot reorder the @everyone role' });
                }
            }

            // Validate that non-owners can't reorder roles at or above their highest position
            if (!isOwner) {
                const userHighestPosition =
                    await permissionService.getHighestRolePosition(
                        serverId,
                        userId,
                    );

                // Check each role being reordered
                for (const { roleId, position } of rolePositions) {
                    const role = await roleRepo.findById(roleId);
                    if (!role) continue;

                    // Skip @everyone role in non-owner validation
                    if (
                        role.name &&
                        role.name.trim().toLowerCase() === '@everyone'
                    ) {
                        continue;
                    }

                    // Can't reorder roles they have themselves
                    const member = await serverMemberRepo.findByServerAndUser(
                        serverId,
                        userId,
                    );
                    if (
                        member &&
                        member.roles.some((r: any) => r.toString() === roleId)
                    ) {
                        return res.status(403).json({
                            error: 'Cannot reorder a role you currently have',
                        });
                    }

                    // Can't reorder roles at or above their position
                    if (role.position >= userHighestPosition) {
                        return res.status(403).json({
                            error: 'Cannot reorder roles at or above your highest role position',
                        });
                    }

                    // Can't move roles to a position at or above their highest position
                    if (position >= userHighestPosition) {
                        return res.status(403).json({
                            error: 'Cannot move roles to a position at or above your highest role',
                        });
                    }
                }
            }

            // Update all role positions
            for (const { roleId, position } of rolePositions) {
                await roleRepo.update(roleId, { position });
            }

            // Fetch updated roles to send to clients
            const updatedRoles = await roleRepo.findByServerId(serverId);

            // Emit socket event to notify all members
            const io = getIO();
            io.to(`server:${serverId}`).emit('roles_reordered', {
                serverId,
                roles: updatedRoles,
            });

            res.json({ message: 'Roles reordered', roles: updatedRoles });
        } catch (err: any) {
            logger.error('Failed to reorder roles:', err);
            res.status(500).json({ error: 'Failed to reorder roles' });
        }
    },
);

// Update a role
router.patch(
    '/:serverId/roles/:roleId',
    authenticateToken,
    validate({ params: serverRoleIdParamSchema, body: updateRoleSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const username = user.username;
            const userId = user.id;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }
            const { serverId, roleId } = req.params as {
                serverId: string;
                roleId: string;
            };
            const {
                name,
                color,
                startColor,
                endColor,
                colors,
                gradientRepeat,
                separateFromOtherRoles,
                permissions,
                position,
            } = req.body as {
                name?: string;
                color?: string;
                startColor?: string;
                endColor?: string;
                colors?: string[];
                gradientRepeat?: number;
                separateFromOtherRoles?: boolean;
                permissions?: any;
                position?: number;
            };

            // If gradient colors are provided, clear the solid color to indicate gradient mode
            const roleColor = startColor || endColor ? null : color;

            if (
                !(await permissionService.hasPermission(
                    serverId,
                    userId!,
                    'manageRoles',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to manage roles' });
            }

            const roleToUpdate = await roleRepo.findById(roleId);
            if (!roleToUpdate) {
                return res.status(404).json({ error: 'Role not found' });
            }

            const server = await serverRepo.findById(serverId);
            const isOwner = server && server.ownerId.toString() === userId;

            // Prevent non-owners from editing roles they have themselves
            if (!isOwner) {
                const member = await serverMemberRepo.findByServerAndUser(
                    serverId,
                    userId,
                );
                if (
                    member &&
                    member.roles.some((r: any) => r.toString() === roleId)
                ) {
                    return res.status(403).json({
                        error: 'Cannot edit a role you currently have',
                    });
                }

                // Prevent non-owners from editing roles at or above their highest position
                const userHighestPosition =
                    await permissionService.getHighestRolePosition(
                        serverId,
                        userId,
                    );
                if (roleToUpdate.position >= userHighestPosition) {
                    return res.status(403).json({
                        error: 'Cannot edit roles at or above your highest role position',
                    });
                }
            }

            const updates: any = {};
            if (name !== undefined) updates.name = name;
            if (roleColor !== undefined) updates.color = roleColor;
            if (startColor !== undefined) updates.startColor = startColor;
            if (endColor !== undefined) updates.endColor = endColor;
            if (colors !== undefined) updates.colors = colors;
            if (gradientRepeat !== undefined)
                updates.gradientRepeat = gradientRepeat;
            if (separateFromOtherRoles !== undefined)
                updates.separateFromOtherRoles = separateFromOtherRoles;
            if (permissions !== undefined) {
                // If permissions is an empty object, set all permissions to false
                if (permissions && Object.keys(permissions).length === 0) {
                    updates.permissions = {
                        sendMessages: false,
                        manageMessages: false,
                        deleteMessagesOfOthers: false,
                        manageChannels: false,
                        manageRoles: false,
                        banMembers: false,
                        kickMembers: false,
                        manageInvites: false,
                        manageServer: false,
                        administrator: false,
                        pingRolesAndEveryone: false,
                    };
                } else {
                    updates.permissions = permissions;
                }
            }
            if (position !== undefined) {
                // Prevent non-owners from setting position higher than their own
                if (!isOwner) {
                    const userHighestPosition =
                        await permissionService.getHighestRolePosition(
                            serverId,
                            userId,
                        );
                    if (position >= userHighestPosition) {
                        return res.status(403).json({
                            error: 'Cannot set role position at or above your highest role',
                        });
                    }
                }
                updates.position = position;
            }

            const role = await roleRepo.update(roleId, updates);

            // Emit socket event to notify all server members about role update
            const io = getIO();
            io.to(`server:${serverId}`).emit('role_updated', {
                serverId,
                role,
            });

            res.json(role);
        } catch (err: any) {
            logger.error('Failed to update role:', err);
            res.status(500).json({ error: 'Failed to update role' });
        }
    },
);

// Delete a role
router.delete(
    '/:serverId/roles/:roleId',
    authenticateToken,
    validate({ params: serverRoleIdParamSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const username = user.username;
            const userId = user.id;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }
            const { serverId, roleId } = req.params as {
                serverId: string;
                roleId: string;
            };

            if (
                !(await permissionService.hasPermission(
                    serverId,
                    userId!,
                    'manageRoles',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to manage roles' });
            }

            const roleToDelete = await roleRepo.findById(roleId);
            if (!roleToDelete) {
                return res.status(404).json({ error: 'Role not found' });
            }

            const server = await serverRepo.findById(serverId);
            const isOwner = server && server.ownerId.toString() === userId;

            // Prevent non-owners from deleting roles they have themselves
            if (!isOwner) {
                const currentUserMember =
                    await serverMemberRepo.findByServerAndUser(
                        serverId,
                        userId,
                    );
                if (
                    currentUserMember &&
                    currentUserMember.roles.some(
                        (r: any) => r.toString() === roleId,
                    )
                ) {
                    return res.status(403).json({
                        error: 'Cannot delete a role you currently have',
                    });
                }

                // Prevent non-owners from deleting roles at or above their highest position
                const userHighestPosition =
                    await permissionService.getHighestRolePosition(
                        serverId,
                        userId,
                    );
                if (roleToDelete.position >= userHighestPosition) {
                    return res.status(403).json({
                        error: 'Cannot delete roles at or above your highest role position',
                    });
                }
            }

            // Check if the role being deleted is an administrator role
            if (roleToDelete.permissions.administrator) {
                // Check if the current user has this admin role
                const currentUserMember =
                    await serverMemberRepo.findByServerAndUser(
                        serverId,
                        userId,
                    );
                if (
                    currentUserMember &&
                    currentUserMember.roles.some(
                        (r: any) => r.toString() === roleId,
                    )
                ) {
                    // User is trying to delete their own admin role - prevent this
                    if (!isOwner) {
                        return res.status(403).json({
                            error: 'Cannot delete your own administrator role',
                        });
                    }
                }
            }

            // Clear default role if this role was set as default
            await serverRepo.clearDefaultRole(serverId, roleId);

            await roleRepo.delete(roleId);
            await serverMemberRepo.removeRoleFromAllMembers(serverId, roleId);

            // Emit socket event to notify all clients in the server
            try {
                const io = getIO();
                io.to(`server:${serverId}`).emit('role_deleted', {
                    serverId,
                    roleId,
                });
            } catch (err) {
                logger.error('Failed to emit role deletion:', err);
            }

            res.json({ message: 'Role deleted' });
        } catch (err: any) {
            logger.error('Failed to delete role:', err);
            res.status(500).json({ error: 'Failed to delete role' });
        }
    },
);

// Assign role to member
router.post(
    '/:serverId/members/:userId/roles/:roleId',
    authenticateToken,
    validate({ params: serverUserIdRoleIdParamSchema }),
    async (req, res) => {
        try {
            const authUser = (req as AuthenticatedRequest).user;
            const username = authUser.username;
            const currentUserId = authUser.id;
            if (!currentUserId) {
                return res.status(401).json({ error: 'unauthorized' });
            }
            const { serverId, userId, roleId } = req.params as {
                serverId: string;
                userId: string;
                roleId: string;
            };

            if (!userId) {
                return res.status(400).json({ error: 'User ID is required' });
            }

            if (
                !(await permissionService.hasPermission(
                    serverId,
                    currentUserId,
                    'manageRoles',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to manage roles' });
            }

            const roleToAssign = await roleRepo.findById(roleId);
            if (!roleToAssign) {
                return res.status(404).json({ error: 'Role not found' });
            }

            const server = await serverRepo.findById(serverId);
            const isOwner =
                server && server.ownerId.toString() === currentUserId;

            // Prevent non-owners from assigning roles at or above their highest position
            if (!isOwner) {
                const userHighestPosition =
                    await permissionService.getHighestRolePosition(
                        serverId,
                        currentUserId,
                    );
                if (roleToAssign.position >= userHighestPosition) {
                    return res.status(403).json({
                        error: 'Cannot assign roles at or above your highest role position',
                    });
                }
            }

            let user;
            let memberUserId;

            // Check if userId is a valid ObjectId
            if (mongoose.Types.ObjectId.isValid(userId)) {
                user = await userRepo.findById(userId);
                if (user) {
                    memberUserId = user._id;
                }
            }

            // If not found by ObjectId, try by username
            if (!user) {
                user = await userRepo.findByUsername(userId);
                if (user) {
                    memberUserId = user._id;
                }
            }

            if (!user || !memberUserId) {
                return res.status(404).json({ error: 'User not found' });
            }

            const member = await serverMemberRepo.findByServerAndUser(
                serverId,
                memberUserId.toString(),
            );
            if (!member) {
                return res.status(404).json({ error: 'Member not found' });
            }

            if (!member.roles.includes(roleId as any)) {
                const updatedRoles = [
                    ...member.roles.map((role) => role.toString()),
                    roleId,
                ];
                await serverMemberRepo.updateRoles(
                    serverId,
                    memberUserId.toString(),
                    updatedRoles,
                );
            }

            // Refetch the member to get updated data
            const updatedMember = await serverMemberRepo.findByServerAndUser(
                serverId,
                memberUserId.toString(),
            );
            if (!updatedMember) {
                return res
                    .status(404)
                    .json({ error: 'Member not found after update' });
            }

            // Fetch user data to return with member
            const memberWithUser = {
                ...updatedMember,
                _id: updatedMember._id.toString(),
                userId: user._id.toString(), // Use user's _id directly for consistency
                serverId: updatedMember.serverId.toString(),
                roles: updatedMember.roles.map((role) => role.toString()),
                joinedAt: updatedMember.joinedAt
                    ? updatedMember.joinedAt.toISOString()
                    : new Date().toISOString(),
                user: {
                    username: user.username,
                    profilePicture: user.profilePicture
                        ? `/api/v1/profile/picture/${user.profilePicture}`
                        : null,
                    usernameFont: user.usernameFont,
                    usernameGradient: user.usernameGradient,
                    usernameGlow: user.usernameGlow,
                },
            };

            // Emit socket event to notify all clients in the server
            try {
                const io = getIO();
                io.to(`server:${serverId}`).emit('member_role_updated', {
                    serverId,
                    member: memberWithUser,
                });
            } catch (err) {
                logger.error('Failed to emit member role update:', err);
            }

            res.json(memberWithUser);
        } catch (err: any) {
            logger.error('Failed to assign role to member:', err);
            res.status(500).json({ error: 'Failed to assign role to member' });
        }
    },
);

// Remove role from member
router.delete(
    '/:serverId/members/:userId/roles/:roleId',
    authenticateToken,
    validate({ params: serverUserIdRoleIdParamSchema }),
    async (req, res) => {
        try {
            const authUser = (req as AuthenticatedRequest).user;
            const username = authUser.username;
            const currentUserId = authUser.id;
            if (!currentUserId) {
                return res.status(401).json({ error: 'unauthorized' });
            }
            const { serverId, userId, roleId } = req.params as {
                serverId: string;
                userId: string;
                roleId: string;
            };

            if (!userId) {
                return res.status(400).json({ error: 'User ID is required' });
            }

            if (
                !(await permissionService.hasPermission(
                    serverId,
                    currentUserId,
                    'manageRoles',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to manage roles' });
            }

            const roleBeingRemoved = await roleRepo.findById(roleId);
            if (!roleBeingRemoved) {
                return res.status(404).json({ error: 'Role not found' });
            }

            const server = await serverRepo.findById(serverId);
            const isOwner =
                server && server.ownerId.toString() === currentUserId;

            // Prevent non-owners from removing roles at or above their highest position
            if (!isOwner) {
                const userHighestPosition =
                    await permissionService.getHighestRolePosition(
                        serverId,
                        currentUserId,
                    );
                if (roleBeingRemoved.position >= userHighestPosition) {
                    return res.status(403).json({
                        error: 'Cannot remove roles at or above your highest role position',
                    });
                }
            }

            // Try to find user by ObjectId first, then by username
            let user;
            let memberUserId;

            // Check if userId is a valid ObjectId
            if (mongoose.Types.ObjectId.isValid(userId)) {
                user = await userRepo.findById(userId);
                if (user) {
                    memberUserId = user._id;
                }
            }

            // If not found by ObjectId, try by username
            if (!user) {
                user = await userRepo.findByUsername(userId);
                if (user) {
                    memberUserId = user._id;
                }
            }

            if (!user || !memberUserId) {
                return res.status(404).json({ error: 'User not found' });
            }

            const member = await serverMemberRepo.findByServerAndUser(
                serverId,
                memberUserId.toString(),
            );
            if (!member) {
                return res.status(404).json({ error: 'Member not found' });
            }

            // Server owner can always remove any role from anyone - skip admin permission checks
            if (!isOwner) {
                // Check if the role being removed has Administrator permission
                if (
                    roleBeingRemoved &&
                    roleBeingRemoved.permissions.administrator
                ) {
                    // Check if the target member has Administrator permission (through this or other roles)
                    let targetHasAdministrator = false;
                    for (const targetRoleId of member.roles) {
                        const targetRole = await roleRepo.findById(
                            targetRoleId.toString(),
                        );
                        if (
                            targetRole &&
                            targetRole.permissions.administrator
                        ) {
                            targetHasAdministrator = true;
                            break;
                        }
                    }

                    // Check if the current user has Administrator permission
                    const currentUserMember =
                        await serverMemberRepo.findByServerAndUser(
                            serverId,
                            currentUserId,
                        );
                    let currentUserHasAdministrator = false;
                    if (currentUserMember) {
                        for (const currentUserRoleId of currentUserMember.roles) {
                            const currentUserRole = await roleRepo.findById(
                                currentUserRoleId.toString(),
                            );
                            if (
                                currentUserRole &&
                                currentUserRole.permissions.administrator
                            ) {
                                currentUserHasAdministrator = true;
                                break;
                            }
                        }
                    }

                    // Prevent non-owner administrators from removing Administrator role from other administrators
                    if (targetHasAdministrator && currentUserHasAdministrator) {
                        return res.status(403).json({
                            error: 'Cannot remove Administrator role from other administrators',
                        });
                    }
                }
            }

            const updatedMember = await serverMemberRepo.removeRoleFromMember(
                member._id.toString(),
                roleId,
            );
            if (!updatedMember) {
                return res
                    .status(404)
                    .json({ error: 'Member not found after role removal' });
            }

            // Fetch user data to return with member
            const memberWithUser = {
                ...updatedMember,
                _id: updatedMember._id.toString(),
                userId: user._id.toString(), // Use user's _id directly for consistency
                serverId: updatedMember.serverId.toString(),
                roles: updatedMember.roles.map((role) => role.toString()),
                joinedAt: updatedMember.joinedAt
                    ? updatedMember.joinedAt.toISOString()
                    : new Date().toISOString(),
                user: {
                    username: user.username,
                    profilePicture: user.profilePicture
                        ? `/api/v1/profile/picture/${user.profilePicture}`
                        : null,
                    usernameFont: user.usernameFont,
                    usernameGradient: user.usernameGradient,
                    usernameGlow: user.usernameGlow,
                },
            };

            // Emit socket event to notify all clients in the server
            try {
                const io = getIO();
                io.to(`server:${serverId}`).emit('member_role_updated', {
                    serverId,
                    member: memberWithUser,
                });
            } catch (err) {
                logger.error('Failed to emit member role update:', err);
            }

            res.json(memberWithUser);
        } catch (err: any) {
            logger.error('Failed to remove role:', err);
            res.status(500).json({ error: 'Failed to remove role' });
        }
    },
);

// Get invites for a server
router.get(
    '/:serverId/invites',
    authenticateToken,
    validate({ params: serverIdParamSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const username = user.username;
            const userId = user.id;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }
            const { serverId } = req.params as { serverId: string };

            const member = await serverMemberRepo.findByServerAndUser(
                serverId,
                userId,
            );
            if (!member) {
                return res
                    .status(403)
                    .json({ error: 'Not a member of this server' });
            }

            if (
                !(await permissionService.hasPermission(
                    serverId,
                    userId!,
                    'manageInvites',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to view invites' });
            }

            const invites = await inviteRepo.findByServerId(serverId);
            res.json(invites);
        } catch (err: any) {
            logger.error('Failed to get invites:', err);
            res.status(500).json({ error: 'Failed to get invites' });
        }
    },
);

/**
 * POST /:serverId/invites
 * Create a new invite link for the server.
 * Requires 'createInvite' permission.
 */
router.post(
    '/:serverId/invites',
    authenticateToken,
    validate({ body: createInviteSchema }),
    validate({ params: serverIdParamSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const username = user.username;
            const userId = user.id;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }
            const { serverId } = req.params as { serverId: string };
            const { customPath, maxUses, expiresIn } = req.body;

            if (
                !(await permissionService.hasPermission(
                    serverId,
                    userId!,
                    'manageInvites',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to manage invites' });
            }

            // Generate random code
            const code = Math.random().toString(36).substring(2, 10);

            const invite: any = {
                serverId,
                code,
                createdByUserId: userId,
            };

            if (customPath) {
                // Check if custom path is already taken
                const existing = await inviteRepo.findByCustomPath(customPath);
                if (existing) {
                    return res
                        .status(400)
                        .json({ error: 'Custom path already taken' });
                }
                invite.customPath = customPath;
            }

            if (maxUses) invite.maxUses = maxUses;
            if (expiresIn) {
                const now = new Date();
                invite.expiresAt = new Date(now.getTime() + expiresIn * 1000);
            }

            const newInvite = await inviteRepo.create(invite);

            // Emit socket event to notify all server members about new invite
            // try {
            //     const io = getIO();
            //     io.to(`server:${serverId}`).emit('invite_created', {
            //         serverId,
            //         invite: newInvite,
            //     });
            // } catch (err) {
            //     logger.error('Failed to emit invite creation:', err);
            // }
            // Note to myself: Send this to people who really need to see this? like admins or people with right permissions!

            res.json(newInvite);
        } catch (err: any) {
            logger.error('Failed to create invite:', err);
            res.status(500).json({ error: 'Failed to create invite' });
        }
    },
);

// Delete an invite
router.delete(
    '/:serverId/invites/:inviteId',
    authenticateToken,
    validate({ params: serverInviteIdParamSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const username = user.username;
            const userId = user.id;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }
            const { serverId, inviteId } = req.params as {
                serverId: string;
                inviteId: string;
            };

            if (
                !(await permissionService.hasPermission(
                    serverId,
                    userId!,
                    'manageInvites',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to manage invites' });
            }

            await inviteRepo.delete(inviteId);

            // Emit socket event to notify all server members about invite deletion
            // try {
            //     const io = getIO();
            //     io.to(`server:${serverId}`).emit('invite_deleted', {
            //         serverId,
            //         inviteId,
            //     });
            // } catch (err) {
            //     logger.error('Failed to emit invite deletion:', err);
            // }
            // Note: same reasoning.

            res.json({ message: 'Invite deleted' });
        } catch (err: any) {
            logger.error('Failed to delete invite:', err);
            res.status(500).json({ error: 'Failed to delete invite' });
        }
    },
);

// Get invite information (no auth required for preview)
router.get(
    '/invite/:inviteCode',
    validate({ params: inviteCodeParamSchema }),
    async (req, res) => {
        try {
            const { inviteCode } = req.params as { inviteCode: string };

            const invite = await inviteRepo.findByCodeOrCustomPath(inviteCode);

            if (!invite) {
                return res.status(404).json({ error: 'Invite not found' });
            }

            // Check if expired
            if (invite.expiresAt && invite.expiresAt < new Date()) {
                return res.status(410).json({ error: 'Invite expired' });
            }

            // Check if max uses reached
            if (invite.maxUses && invite.uses >= invite.maxUses) {
                return res
                    .status(410)
                    .json({ error: 'Invite max uses reached' });
            }

            // Get server info
            const server = await serverRepo.findById(
                invite.serverId.toString(),
            );
            if (!server) {
                return res.status(404).json({ error: 'Server not found' });
            }

            // Get member count
            const memberCount = await serverMemberRepo.countByServerId(
                invite.serverId.toString(),
            );

            // Return invite info
            res.json({
                code: invite.customPath || invite.code,
                server: {
                    _id: server._id,
                    name: server.name,
                    icon: server.icon,
                    banner: server.banner,
                    memberCount,
                },
                expiresAt: invite.expiresAt,
                uses: invite.uses,
                maxUses: invite.maxUses,
            });
        } catch (err: any) {
            logger.error('Failed to get invite info:', err);
            res.status(500).json({ error: 'Failed to get invite info' });
        }
    },
);

// Join server via invite
router.post(
    '/join/:codeOrPath',
    authenticateToken,
    validate({ params: codeOrPathParamSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const userId = user.id;
            const username = user.username;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }
            const { codeOrPath } = req.params as { codeOrPath: string };

            const invite = await inviteRepo.findByCodeOrCustomPath(codeOrPath);

            if (!invite) {
                return res.status(404).json({ error: 'Invite not found' });
            }

            // Check if expired
            if (invite.expiresAt && invite.expiresAt < new Date()) {
                return res.status(400).json({ error: 'Invite expired' });
            }

            // Check if max uses reached
            if (invite.maxUses && invite.uses >= invite.maxUses) {
                return res
                    .status(400)
                    .json({ error: 'Invite max uses reached' });
            }

            // Check if already a member
            const existingMember = await serverMemberRepo.findByServerAndUser(
                invite.serverId.toString(),
                userId,
            );

            if (existingMember) {
                return res
                    .status(400)
                    .json({ error: 'Already a member of this server' });
            }

            // Check if user is banned
            const existingBan = await serverBanRepo.findByServerAndUser(
                invite.serverId.toString(),
                userId,
            );

            if (existingBan) {
                return res.status(403).json({
                    error: 'You are banned from this server',
                    banReason: existingBan.reason || 'No reason provided',
                });
            }

            // Get @everyone role
            const everyoneRole = await roleRepo.findByServerIdAndName(
                invite.serverId.toString(),
                '@everyone',
            );

            // Get server to check for default role
            const serverWithDefaultRole = await serverRepo.findById(
                invite.serverId.toString(),
            );

            // Build initial roles array
            const initialRoles: string[] = [];
            if (everyoneRole) {
                initialRoles.push(everyoneRole._id.toString());
            }

            // Add default role if set
            if (serverWithDefaultRole?.defaultRoleId) {
                initialRoles.push(
                    serverWithDefaultRole.defaultRoleId.toString(),
                );
            }

            // Add member
            const member = await serverMemberRepo.create({
                serverId: invite.serverId.toString(),
                userId: userId,
                roles: initialRoles,
            });

            // Increment uses
            await inviteRepo.incrementUses(invite._id.toString());

            const server = await serverRepo.findById(
                invite.serverId.toString(),
            );

            // Emit socket event to notify all members about new member
            try {
                const io = getIO();
                io.to(`server:${invite.serverId.toString()}`).emit(
                    'server_member_joined',
                    {
                        serverId: invite.serverId.toString(),
                        userId: userId,
                        member: {
                            ...member,
                            user: {
                                username,
                                profilePicture: user.profilePicture
                                    ? `/api/v1/profile/picture/${user.profilePicture}`
                                    : null,
                            },
                        },
                    },
                );
            } catch (err) {
                logger.error('Failed to emit server member join:', err);
            }

            res.json({ server, member });
        } catch (err: any) {
            logger.error('Failed to join server:', err);
            res.status(500).json({ error: 'Failed to join server' });
        }
    },
);

// Leave server
router.post(
    '/:serverId/leave',
    authenticateToken,
    validate({ params: serverIdParamSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const username = user.username;
            const userId = user.id;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }
            const { serverId } = req.params as { serverId: string };

            const server = await serverRepo.findById(serverId);
            if (!server) {
                return res.status(404).json({ error: 'Server not found' });
            }

            if (server.ownerId.toString() === userId) {
                return res.status(400).json({
                    error: 'Owner cannot leave server. Transfer ownership or delete the server.',
                });
            }

            await serverMemberRepo.remove(serverId, userId);

            // Emit socket event to notify all members and the leaving user
            try {
                const io = getIO();
                io.to(`server:${serverId}`).emit('server_member_left', {
                    serverId,
                    userId,
                });
            } catch (err) {
                logger.error('Failed to emit server member leave:', err);
            }

            res.json({ message: 'Left server' });
        } catch (err: any) {
            logger.error('Failed to leave server:', err);
            res.status(500).json({ error: 'Failed to leave server' });
        }
    },
);

// Kick member
router.delete(
    '/:serverId/members/:userId',
    authenticateToken,
    validate({ params: serverIdParamSchema.merge(userIdParamSchema) }),
    async (req, res) => {
        try {
            const authUser = (req as AuthenticatedRequest).user;
            const username = authUser.username;
            const currentUserId = authUser.id;
            if (!currentUserId) {
                return res.status(401).json({ error: 'unauthorized' });
            }
            const { serverId, userId } = req.params as {
                serverId: string;
                userId: string;
            };

            const server = await serverRepo.findById(serverId);

            // Only the server owner can kick, or users with kickMembers permission
            // But administrators cannot kick the server owner
            if (server && server.ownerId.toString() === userId) {
                return res
                    .status(400)
                    .json({ error: 'Cannot kick server owner' });
            }

            if (
                !(await permissionService.hasPermission(
                    serverId,
                    currentUserId,
                    'kickMembers',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to kick members' });
            }

            await serverMemberRepo.remove(serverId, userId);

            // Emit socket event to notify all members and the kicked user
            try {
                const io = getIO();
                io.to(`server:${serverId}`).emit('server_member_left', {
                    serverId,
                    userId,
                });
            } catch (err) {
                logger.error('Failed to emit server member kick:', err);
            }

            res.json({ message: 'Member kicked' });
        } catch (err: any) {
            logger.error('Failed to kick member:', err);
            res.status(500).json({ error: 'Failed to kick member' });
        }
    },
);

/**
 * POST /:serverId/bans/:userId
 * Ban a user from the server.
 * Requires 'banMembers' permission.
 * Cannot ban users with higher or equal roles.
 */
router.post(
    '/:serverId/bans/:userId',
    authenticateToken,
    validate({
        params: serverIdParamSchema.merge(userIdParamSchema),
        body: banMemberSchema,
    }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const username = user.username;
            const currentUserId = user.id;
            if (!currentUserId) {
                return res.status(401).json({ error: 'unauthorized' });
            }
            const { serverId, userId } = req.params as {
                serverId: string;
                userId: string;
            };
            const { reason } = req.body;

            if (
                !(await permissionService.hasPermission(
                    serverId,
                    currentUserId,
                    'banMembers',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to ban members' });
            }

            const server = await serverRepo.findById(serverId);
            if (server && server.ownerId.toString() === userId) {
                return res
                    .status(400)
                    .json({ error: 'Cannot ban server owner' });
            }

            // Check if already banned
            const existingBan = await serverBanRepo.findByServerAndUser(
                serverId,
                userId,
            );
            if (existingBan) {
                return res
                    .status(400)
                    .json({ error: 'User is already banned' });
            }

            // Create ban
            const ban = await serverBanRepo.create({
                serverId,
                userId,
                bannedBy: currentUserId,
                reason: reason || undefined,
            });

            // Fetch the banned user's details for the response
            const bannedUser = await userRepo.findById(userId);
            const currentUser = await userRepo.findById(currentUserId);

            // Convert Mongoose document to plain object
            const banObject =
                typeof (ban as any).toObject === 'function'
                    ? (ban as any).toObject()
                    : ban;

            const populatedBan = {
                ...banObject,
                user: bannedUser
                    ? {
                          _id: bannedUser._id,
                          username: bannedUser.username,
                          profilePicture: bannedUser.profilePicture,
                      }
                    : null,
                bannedByUser: currentUser
                    ? { _id: currentUser._id, username: currentUser.username }
                    : null,
            };

            // Remove member if they are currently in the server
            await serverMemberRepo.remove(serverId, userId);

            // Emit socket event to notify all members and the banned user
            try {
                const io = getIO();
                io.to(`server:${serverId}`).emit('server_member_banned', {
                    serverId,
                    userId,
                    ban: populatedBan,
                });
                io.to(`server:${serverId}`).emit('server_member_left', {
                    serverId,
                    userId,
                });
            } catch (err) {
                logger.error('Failed to emit server member ban:', err);
            }

            res.json({ message: 'Member banned', ban: populatedBan });
        } catch (err: any) {
            logger.error('Failed to ban member:', err);
            res.status(500).json({ error: 'Failed to ban member' });
        }
    },
);

/**
 * DELETE /:serverId/bans/:userId
 * Unban a user from the server.
 * Requires 'banMembers' permission.
 */
router.delete(
    '/:serverId/bans/:userId',
    authenticateToken,
    validate({ params: serverIdParamSchema.merge(userIdParamSchema) }),
    async (req, res) => {
        try {
            const authUser = (req as AuthenticatedRequest).user;
            const username = authUser.username;
            const currentUserId = authUser.id;
            if (!currentUserId) {
                return res.status(401).json({ error: 'unauthorized' });
            }
            const { serverId, userId } = req.params as {
                serverId: string;
                userId: string;
            };

            if (
                !(await permissionService.hasPermission(
                    serverId,
                    currentUserId,
                    'banMembers',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to manage bans' });
            }

            const success = await serverBanRepo.unban(serverId, userId);
            if (!success) {
                return res.status(404).json({ error: 'Ban not found' });
            }

            // Emit socket event to notify all members about unban
            try {
                // const io = getIO();
                // io.to(`server:${serverId}`).emit('server_member_unbanned', {
                //     serverId,
                //     userId,
                //     unbannedBy: username,
                //     unbannedAt: new Date()
                // });
            } catch (err) {
                logger.error('Failed to emit server member unban:', err);
            }

            res.json({ message: 'Member unbanned' });
        } catch (err: any) {
            logger.error('Failed to unban member:', err);
            res.status(500).json({ error: 'Failed to unban member' });
        }
    },
);

// Get bans for a server
router.get(
    '/:serverId/bans',
    authenticateToken,
    validate({ params: serverIdParamSchema }),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const username = user.username;
            const userId = user.id;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }
            const { serverId } = req.params as { serverId: string };

            // Check if user is a member
            const member = await serverMemberRepo.findByServerAndUser(
                serverId,
                userId,
            );
            if (!member) {
                return res
                    .status(403)
                    .json({ error: 'Not a member of this server' });
            }

            if (
                !(await permissionService.hasPermission(
                    serverId,
                    userId!,
                    'banMembers',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to view bans' });
            }

            const bans = await serverBanRepo.findByServerId(serverId);

            // Populate user data for each ban
            const populatedBans = await Promise.all(
                bans.map(async (ban) => {
                    const [bannedUser, bannedByUser] = await Promise.all([
                        userRepo.findById(ban.userId.toString()),
                        userRepo.findById(ban.bannedBy.toString()),
                    ]);
                    return {
                        ...ban,
                        user: bannedUser
                            ? {
                                  _id: bannedUser._id,
                                  username: bannedUser.username,
                                  profilePicture: bannedUser.profilePicture,
                              }
                            : null,
                        bannedByUser: bannedByUser
                            ? {
                                  _id: bannedByUser._id,
                                  username: bannedByUser.username,
                              }
                            : null,
                    };
                }),
            );

            res.json(populatedBans);
        } catch (err: any) {
            logger.error('Failed to get bans:', err);
            res.status(500).json({ error: 'Failed to get bans' });
        }
    },
);

// Get messages for a channel
router.get(
    '/:serverId/channels/:channelId/messages',
    authenticateToken,
    validate({ params: serverChannelIdParamSchema }),
    async (req, res) => {
        try {
            const authUser = (req as AuthenticatedRequest).user;
            const username = authUser.username;
            const userId = authUser.id;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }
            const { serverId, channelId } = req.params as {
                serverId: string;
                channelId: string;
            };
            const limit = parseInt(req.query.limit as string) || 50;
            const before = req.query.before as string;
            const around = req.query.around as string;

            const member = await serverMemberRepo.findByServerAndUser(
                serverId,
                userId,
            );
            if (!member) {
                return res
                    .status(403)
                    .json({ error: 'Not a member of this server' });
            }

            const messages = await serverMessageRepo.findByChannelId(
                channelId,
                limit,
                before,
                around,
            );

            // Fetch reactions for all messages
            const messageIds = messages.map((m) => m._id.toString());
            const reactionsMap = await reactionRepo.getReactionsForMessages(
                messageIds,
                'server',
                userId,
            );

            const messagesWithReactions = messages.map((msg) => {
                const msgObj = (msg as any).toObject
                    ? (msg as any).toObject()
                    : msg;
                return {
                    ...msgObj,
                    reactions: reactionsMap[msg._id.toString()] || [],
                };
            });

            res.json(messagesWithReactions);
        } catch (err: any) {
            logger.error('Failed to get messages:', err);
            res.status(500).json({ error: 'Failed to get messages' });
        }
    },
);

// Get single message by ID (with replied message if exists)
router.get(
    '/:serverId/channels/:channelId/messages/:messageId',
    authenticateToken,
    validate({ params: serverChannelMessageIdParamSchema }),
    async (req, res) => {
        try {
            const userId = (req as any).user?.id as string;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }

            const { serverId, channelId, messageId } = req.params as {
                serverId: string;
                channelId: string;
                messageId: string;
            };

            // Check if user is a member of the server
            const member = await serverMemberRepo.findByServerAndUser(
                serverId,
                userId,
            );
            if (!member) {
                return res
                    .status(403)
                    .json({ error: 'Not a member of this server' });
            }

            // Find the target message
            const targetMessage = await serverMessageRepo.findById(messageId);
            if (!targetMessage) {
                return res.status(404).json({ error: 'Message not found' });
            }

            // Verify the message belongs to the requested channel
            if (targetMessage.channelId.toString() !== channelId) {
                return res
                    .status(403)
                    .json({ error: 'Message does not belong to this channel' });
            }

            // If this message has a reply, fetch the replied message as well
            let repliedMessage = null;
            if (targetMessage.replyToId) {
                const repliedMsg = await serverMessageRepo.findById(
                    targetMessage.replyToId.toString(),
                );

                // Verify the replied message is also in the same channel
                if (
                    repliedMsg &&
                    repliedMsg.channelId.toString() === channelId
                ) {
                    repliedMessage = repliedMsg;
                }
            }

            res.status(200).json({ message: targetMessage, repliedMessage });
        } catch (err: any) {
            logger.error('Failed to get message:', err);
            res.status(500).json({ error: 'Failed to get message' });
        }
    },
);

// Edit message
router.patch(
    '/:serverId/channels/:channelId/messages/:messageId',
    authenticateToken,
    validate({
        params: serverChannelMessageIdParamSchema,
        body: editServerMessageSchema,
    }),
    async (req, res) => {
        try {
            const userId = (req as any).user?.id as string;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }

            const { messageId } = req.params as { messageId: string };
            const { content } = req.body;

            const message = await serverMessageRepo.findById(messageId);
            if (!message) {
                return res.status(404).json({ error: 'Message not found' });
            }

            if (message.senderId.toString() !== userId) {
                return res
                    .status(403)
                    .json({ error: 'Can only edit your own messages' });
            }

            const updatedMessage = await serverMessageRepo.update(messageId, {
                text: content,
                editedAt: new Date(),
                isEdited: true,
            });

            // Emit socket event to notify all users in the channel about message edit
            try {
                const io = getIO();
                io.to(`channel:${message.channelId}`).emit(
                    'server_message_edited',
                    updatedMessage,
                );
            } catch (err) {
                logger.error('Failed to emit message edit:', err);
            }

            res.json(updatedMessage);
        } catch (err: any) {
            logger.error('Failed to edit message:', err);
            res.status(500).json({ error: 'Failed to edit message' });
        }
    },
);

// Delete message
router.delete(
    '/:serverId/channels/:channelId/messages/:messageId',
    authenticateToken,
    validate({ params: serverChannelMessageIdParamSchema }),
    async (req, res) => {
        try {
            const userId = (req as any).user?.id as string;
            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }

            const { serverId, messageId } = req.params as {
                serverId: string;
                messageId: string;
            };

            const message = await serverMessageRepo.findById(messageId);
            if (!message) {
                return res.status(404).json({ error: 'Message not found' });
            }

            // Users can delete their own messages, or if they have deleteMessagesOfOthers permission
            const isOwnMessage = message.senderId.toString() === userId;

            // For permission checks, we still need the username
            const authUser = (req as AuthenticatedRequest).user;
            const username = authUser.username;
            const canDeleteOthers = await permissionService.hasPermission(
                serverId,
                userId!,
                'deleteMessagesOfOthers',
            );
            const canManageMessages = await permissionService.hasPermission(
                serverId,
                userId!,
                'manageMessages',
            );

            const canDelete =
                isOwnMessage || canDeleteOthers || canManageMessages;

            if (!canDelete) {
                return res
                    .status(403)
                    .json({ error: 'No permission to delete this message' });
            }

            await serverMessageRepo.delete(messageId);

            // Emit socket event to notify all users in the channel about message deletion
            try {
                const io = getIO();
                io.to(`channel:${message.channelId}`).emit(
                    'server_message_deleted',
                    {
                        messageId,
                        channelId: message.channelId,
                        serverId,
                    },
                );
            } catch (err) {
                logger.error('Failed to emit message deletion:', err);
            }

            res.json({ message: 'Message deleted' });
        } catch (err: any) {
            logger.error('Failed to delete message:', err);
            res.status(500).json({ error: 'Failed to delete message' });
        }
    },
);

// Register webhook routes under /api/v1/servers
router.use('/', webhooksRoutes);

// Register emoji routes under /api/v1/servers
router.use('/', emojisRoutes);

export default router;
