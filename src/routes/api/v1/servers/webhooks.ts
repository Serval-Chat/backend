import express, { Router } from 'express';
import {
    authenticateToken,
    type AuthenticatedRequest,
} from '../../../../middleware/auth';
import { generateWebhookToken } from '../../../../services/WebhookService';
import { container } from '../../../../di/container';
import { TYPES } from '../../../../di/types';
import type { IWebhookRepository } from '../../../../di/interfaces/IWebhookRepository';
import type { IServerMemberRepository } from '../../../../di/interfaces/IServerMemberRepository';
import type { IChannelRepository } from '../../../../di/interfaces/IChannelRepository';
import type { IServerMessageRepository } from '../../../../di/interfaces/IServerMessageRepository';
import type { PermissionService } from '../../../../services/PermissionService';

const webhookRepo = container.get<IWebhookRepository>(TYPES.WebhookRepository);
const serverMemberRepo = container.get<IServerMemberRepository>(
    TYPES.ServerMemberRepository,
);
const channelRepo = container.get<IChannelRepository>(TYPES.ChannelRepository);
const serverMessageRepo = container.get<IServerMessageRepository>(
    TYPES.ServerMessageRepository,
);
const permissionService = container.get<PermissionService>(
    TYPES.PermissionService,
);
import logger from '../../../../utils/logger';
import crypto from 'crypto';
import mongoose from 'mongoose';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { getIO } from '../../../../socket';
import { validate } from '../../../../validation/middleware';
import {
    webhookChannelParamsSchema,
    webhookIdParamSchema,
    createWebhookSchema,
    executeWebhookSchema,
    webhookTokenParamSchema,
} from '../../../../validation/schemas/webhooks';
import {
    messagesSentCounter,
    websocketMessagesCounter,
} from '../../../../utils/metrics';
import { memoryUpload } from '../../../../config/multer';

/**
 * Webhook Management Router
 * Handles creation, management, and execution of server webhooks.
 */
const router = express.Router();

/**
 * GET /:serverId/channels/:channelId/webhooks
 * List all webhooks for a specific channel.
 * Requires 'manageWebhooks' permission.
 */
router.get(
    '/:serverId/channels/:channelId/webhooks',
    authenticateToken,
    validate({ params: webhookChannelParamsSchema }),
    async (req, res) => {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user;
            const { serverId, channelId } = req.params;

            // Type guards
            if (!serverId || !channelId) {
                return res
                    .status(400)
                    .json({ error: 'Server ID and Channel ID are required' });
            }

            // Verify user is member of server
            const member = await serverMemberRepo.findByServerAndUser(
                serverId,
                userId,
            );
            if (!member) {
                return res
                    .status(403)
                    .json({ error: 'Not a member of this server' });
            }

            // Check permissions
            if (
                !(await permissionService.hasPermission(
                    serverId,
                    userId,
                    'manageWebhooks',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to manage webhooks' });
            }

            // Verify channel exists
            const channel = await channelRepo.findByIdAndServer(
                channelId,
                serverId,
            );
            if (!channel) {
                return res.status(404).json({ error: 'Channel not found' });
            }

            // Get webhooks for this channel
            const webhooks = await webhookRepo.findByChannelId(channelId);
            const mappedWebhooks = webhooks.map((w) => ({
                _id: w._id,
                name: w.name,
                token: w.token,
                avatarUrl: w.avatarUrl,
                createdBy: w.createdBy,
                createdAt: w.createdAt,
            }));

            res.json(mappedWebhooks);
        } catch (err: any) {
            logger.error('Failed to get webhooks:', err);
            res.status(500).json({ error: 'Failed to get webhooks' });
        }
    },
);

/**
 * POST /:serverId/channels/:channelId/webhooks
 * Create a new webhook for a channel.
 * Requires 'manageWebhooks' permission.
 *
 * Features:
 * - Generates a secure token for the webhook
 * - Supports optional avatar upload
 */
router.post(
    '/:serverId/channels/:channelId/webhooks',
    authenticateToken,
    validate({ params: webhookChannelParamsSchema, body: createWebhookSchema }),
    async (req, res) => {
        try {
            const { username, id: userId } = (req as AuthenticatedRequest).user;
            const { serverId, channelId } = req.params;
            const { name, avatarUrl } = req.body;

            // Type guards
            if (!serverId || !channelId) {
                return res
                    .status(400)
                    .json({ error: 'Server ID and Channel ID are required' });
            }

            // Validate input
            if (!name || typeof name !== 'string' || name.trim().length === 0) {
                return res
                    .status(400)
                    .json({ error: 'Webhook name is required' });
            }
            if (name.length > 100) {
                return res.status(400).json({
                    error: 'Webhook name must be 100 characters or less',
                });
            }

            // Verify user is member of server
            const member = await serverMemberRepo.findByServerAndUser(
                serverId,
                userId,
            );
            if (!member) {
                return res
                    .status(403)
                    .json({ error: 'Not a member of this server' });
            }

            // Check permissions
            if (
                !(await permissionService.hasPermission(
                    serverId,
                    userId,
                    'manageWebhooks',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to manage webhooks' });
            }

            // Verify channel exists
            const channel = await channelRepo.findByIdAndServer(
                channelId,
                serverId,
            );
            if (!channel) {
                return res.status(404).json({ error: 'Channel not found' });
            }

            // Generate unique token
            let token: string;
            let attempts = 0;
            do {
                token = generateWebhookToken();
                attempts++;
                if (attempts > 10) {
                    return res
                        .status(500)
                        .json({ error: 'Failed to generate unique token' });
                }
            } while (await webhookRepo.findByToken(token));

            // Create webhook
            const webhook = await webhookRepo.create({
                serverId,
                channelId,
                name: name.trim(),
                token,
                avatarUrl: avatarUrl?.trim() || undefined,
                createdBy: username,
            });

            res.status(201).json(webhook);
        } catch (err: any) {
            logger.error('Failed to create webhook:', err);
            res.status(500).json({ error: 'Failed to create webhook' });
        }
    },
);

// DELETE /api/v1/servers/:serverId/channels/:channelId/webhooks/:webhookId
// Delete a webhook
router.delete(
    '/:serverId/channels/:channelId/webhooks/:webhookId',
    authenticateToken,
    validate({ params: webhookIdParamSchema }),
    async (req, res) => {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user;
            const { serverId, channelId, webhookId } = req.params;

            // Type guards
            if (!serverId || !channelId || !webhookId) {
                return res.status(400).json({
                    error: 'Server ID, Channel ID, and Webhook ID are required',
                });
            }

            // Verify user is member of server
            const member = await serverMemberRepo.findByServerAndUser(
                serverId,
                userId,
            );
            if (!member) {
                return res
                    .status(403)
                    .json({ error: 'Not a member of this server' });
            }

            // Check permissions
            if (
                !(await permissionService.hasPermission(
                    serverId,
                    userId,
                    'manageWebhooks',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to manage webhooks' });
            }

            // Find and delete webhook
            const webhook = await webhookRepo.findById(webhookId);

            if (
                !webhook ||
                webhook.serverId.toString() !== serverId ||
                webhook.channelId.toString() !== channelId
            ) {
                return res.status(404).json({ error: 'Webhook not found' });
            }

            await webhookRepo.delete(webhookId);

            res.json({ message: 'Webhook deleted successfully' });
        } catch (err: any) {
            logger.error('Failed to delete webhook:', err);
            res.status(500).json({ error: 'Failed to delete webhook' });
        }
    },
);

// Upload webhook avatar
router.post(
    '/:serverId/channels/:channelId/webhooks/:webhookId/avatar',
    authenticateToken,
    memoryUpload.single('avatar'),
    validate({ params: webhookIdParamSchema }),
    async (req, res) => {
        try {
            const { id: userId } = (req as AuthenticatedRequest).user;
            const { serverId, channelId, webhookId } = req.params;

            // Type guards
            if (!serverId || !channelId || !webhookId) {
                return res.status(400).json({
                    error: 'Server ID, Channel ID, and Webhook ID are required',
                });
            }

            // Verify user is member of server
            const member = await serverMemberRepo.findByServerAndUser(
                serverId,
                userId,
            );
            if (!member) {
                return res
                    .status(403)
                    .json({ error: 'Not a member of this server' });
            }

            // Check permissions
            if (
                !(await permissionService.hasPermission(
                    serverId,
                    userId,
                    'manageWebhooks',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'No permission to manage webhooks' });
            }

            // Find webhook
            const webhook = await webhookRepo.findById(webhookId);
            if (
                !webhook ||
                webhook.serverId.toString() !== serverId ||
                webhook.channelId.toString() !== channelId
            ) {
                return res.status(404).json({ error: 'Webhook not found' });
            }

            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            const uploadsDir = path.join(process.cwd(), 'uploads', 'webhooks');
            if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
            }

            const filename = `${webhookId}-${Date.now()}.png`;
            const filepath = path.join(uploadsDir, filename);

            await sharp(req.file.buffer)
                .resize(128, 128, { fit: 'cover' })
                .png()
                .toFile(filepath);

            const avatarUrl = `/api/v1/webhooks/avatar/${filename}`;
            await webhookRepo.update(webhookId, { avatarUrl });

            res.json({ avatarUrl });
        } catch (err: any) {
            logger.error('Failed to upload webhook avatar:', err);
            res.status(500).json({ error: 'Failed to upload avatar' });
        }
    },
);

const topLevelRouter = express.Router();

// GET webhook avatar (registered at /api/v1/webhooks/)
topLevelRouter.get('/avatar/:filename', (req, res) => {
    try {
        const filename = req.params.filename;

        // Validate filename to prevent path traversal
        if (
            filename.includes('..') ||
            filename.includes('/') ||
            filename.includes('\\')
        ) {
            return res.status(400).json({ error: 'Invalid filename' });
        }

        const filepath = path.join(
            process.cwd(),
            'uploads',
            'webhooks',
            filename,
        );

        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: 'Avatar not found' });
        }

        res.sendFile(filepath);
    } catch (err: any) {
        logger.error('Failed to get webhook avatar:', err);
        res.status(500).json({ error: 'Failed to get avatar' });
    }
});

/**
 * POST /api/v1/webhooks/:token
 * Execute a webhook to send a message.
 *
 * Security:
 * - Validates webhook ID and secure token
 * - No authentication required (public endpoint with token)
 * - Rate limited by standard API limits
 */
topLevelRouter.post(
    '/:token',
    validate({ params: webhookTokenParamSchema, body: executeWebhookSchema }),
    async (req, res) => {
        try {
            const { token } = req.params;
            const { content, username, avatarUrl } = req.body;

            // Validate token length (must be exactly 128 hex characters)
            if (
                !token ||
                token.length !== 128 ||
                !/^[a-f0-9]{128}$/i.test(token)
            ) {
                return res.status(401).json({ error: 'Invalid webhook token' });
            }

            // Find webhook
            const webhook = await webhookRepo.findByToken(token);
            if (!webhook) {
                return res.status(404).json({ error: 'Webhook not found' });
            }

            // Validate content
            if (
                !content ||
                typeof content !== 'string' ||
                content.trim().length === 0
            ) {
                return res
                    .status(400)
                    .json({ error: 'Message content is required' });
            }
            if (content.length > 5000) {
                return res.status(400).json({
                    error: 'Message content must be 5000 characters or less',
                });
            }

            // Validate optional username
            const webhookUsername =
                username &&
                typeof username === 'string' &&
                username.trim().length > 0
                    ? username.trim().substring(0, 100)
                    : webhook.name;

            // Validate optional avatar URL
            const webhookAvatarUrl =
                avatarUrl &&
                typeof avatarUrl === 'string' &&
                avatarUrl.trim().length > 0
                    ? avatarUrl.trim()
                    : webhook.avatarUrl;

            const rawServerId =
                (webhook.serverId as any)?._id ?? webhook.serverId;
            const rawChannelId =
                (webhook.channelId as any)?._id ?? webhook.channelId;

            if (!rawServerId || !rawChannelId) {
                return res
                    .status(500)
                    .json({ error: 'Invalid webhook configuration' });
            }

            const serverIdObject =
                rawServerId instanceof mongoose.Types.ObjectId
                    ? rawServerId
                    : new mongoose.Types.ObjectId(String(rawServerId));
            const channelIdObject =
                rawChannelId instanceof mongoose.Types.ObjectId
                    ? rawChannelId
                    : new mongoose.Types.ObjectId(String(rawChannelId));

            const serverId = serverIdObject.toHexString();
            const channelId = channelIdObject.toHexString();

            // Create message
            // Note: Webhooks don't have a real senderId, so we use a special webhook system user ID
            // You may want to create a dedicated "webhook" system user in your database
            const webhookSystemUserId = new mongoose.Types.ObjectId(
                '000000000000000000000000',
            ); // Placeholder

            const message = await serverMessageRepo.create({
                serverId: serverIdObject,
                channelId: channelIdObject,
                senderId: webhookSystemUserId, // Use system user ID instead of username
                text: content.trim(),
                isWebhook: true,
                webhookUsername,
                webhookAvatarUrl: webhookAvatarUrl || undefined,
            });

            // Update channel's last message time
            await channelRepo.updateLastMessageAt(webhook.channelId.toString());
            // Increment metrics
            messagesSentCounter.labels('webhook').inc();
            websocketMessagesCounter.labels('server_message', 'outbound').inc();

            // Emit via socket (same pattern as regular server messages)
            const io = getIO();
            const msg = (message as any).toObject
                ? (message as any).toObject()
                : message;
            msg._id = msg._id.toString();
            msg.serverId = serverId;
            msg.channelId = channelId;
            if (msg.replyToId) {
                msg.replyToId = msg.replyToId.toString();
            }

            io.to(`channel:${channelId}`).emit('server_message', msg);

            // Notify the whole server about channel activity (for unread indicators)
            io.to(`server:${serverId}`).emit('channel_unread', {
                serverId,
                channelId,
                lastMessageAt: message.createdAt,
                senderId: webhookSystemUserId.toHexString(), // Use senderId instead of sender
            });

            res.status(201).json({
                id: message._id,
                timestamp: message.createdAt,
            });
        } catch (err: any) {
            logger.error('Failed to post webhook message:', err);
            res.status(500).json({ error: 'Failed to post message' });
        }
    },
);

export { topLevelRouter };
export default router;
