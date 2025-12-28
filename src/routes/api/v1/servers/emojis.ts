import { Router } from 'express';
import {
    authenticateToken,
    type AuthenticatedRequest,
} from '@/middleware/auth';
import { container } from '@/di/container';
import { TYPES } from '@/di/types';
import type { IEmojiRepository } from '@/di/interfaces/IEmojiRepository';
import type { IServerRepository } from '@/di/interfaces/IServerRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { PermissionService } from '@/services/PermissionService';
import mongoose from 'mongoose';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import logger from '@/utils/logger';
import { getIO } from '@/socket';
import { memoryUpload } from '@/config/multer';

const router = Router();
const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'emojis');

// DI Repository instances
const emojiRepo = container.get<IEmojiRepository>(TYPES.EmojiRepository);
const serverRepo = container.get<IServerRepository>(TYPES.ServerRepository);
const serverMemberRepo = container.get<IServerMemberRepository>(
    TYPES.ServerMemberRepository,
);
const permissionService = container.get<PermissionService>(
    TYPES.PermissionService,
);

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * GET /:serverId/emojis
 * List all custom emojis for a specific server.
 */
router.get('/:serverId/emojis', authenticateToken, async (req, res) => {
    try {
        const { user } = req as AuthenticatedRequest;
        const { serverId } = req.params;
        const userId = user.id;

        if (!userId) {
            return res.status(401).json({ error: 'unauthorized' });
        }

        if (!serverId) {
            return res.status(400).json({ error: 'Server ID is required' });
        }

        // Check if user is a member of the server
        const server = await serverRepo.findById(serverId);
        if (!server) {
            return res.status(404).json({ error: 'Server not found' });
        }

        // Any server member can view emojis
        const isMember = await serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!isMember) {
            return res
                .status(403)
                .json({ error: 'Not a member of this server' });
        }

        const emojis = await emojiRepo.findByServerIdWithCreator(serverId);

        res.json(emojis);
    } catch (err: any) {
        logger.error('Failed to get emojis:', err);
        res.status(500).json({ error: 'Failed to get emojis' });
    }
});

/**
 * POST /:serverId/emojis
 * Upload a new custom emoji to the server.
 *
 * Features:
 * - Supports PNG, JPG, JPEG, GIF, WEBP
 * - Automatically detects animated images
 * - Converts animated GIFs to .gif, others to .webp
 * - Converts static images to .png
 * - Resizes to 128x128px maintaining aspect ratio
 * - Enforces 'manageServer' permission
 */
router.post(
    '/:serverId/emojis',
    authenticateToken,
    memoryUpload.single('emoji'),
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const { serverId } = req.params;
            const { name } = req.body;
            const userId = user.id;
            const file = req.file;

            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }

            if (!serverId) {
                return res.status(400).json({ error: 'Server ID is required' });
            }

            if (!file) {
                return res
                    .status(400)
                    .json({ error: 'Emoji file is required' });
            }

            if (!name || name.length > 32 || !/^[a-zA-Z0-9_-]+$/.test(name)) {
                return res.status(400).json({
                    error: 'Invalid emoji name. Must be 1-32 characters, alphanumeric, underscore, or dash only',
                });
            }

            // Check permissions - owner or has manageServer permission
            const server = await serverRepo.findById(serverId);
            if (!server) {
                return res.status(404).json({ error: 'Server not found' });
            }

            const isOwner = server.ownerId.toString() === userId;
            if (
                !isOwner &&
                !(await permissionService.hasPermission(
                    serverId,
                    userId,
                    'manageServer',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'insufficient permissions' });
            }

            // Check if emoji name already exists for this server
            const existingEmoji = await emojiRepo.findByServerAndName(
                serverId,
                name,
            );
            if (existingEmoji) {
                return res
                    .status(409)
                    .json({ error: 'Emoji name already exists' });
            }

            // Process and save emoji image
            const emojiId = new mongoose.Types.ObjectId();

            // Check image metadata to detect animation
            const metadata = await sharp(file.buffer).metadata();
            const isAnimated = metadata.pages && metadata.pages > 1;

            // Use .gif for animated GIFs, .webp for everything else (including animated WebP)
            let ext = '.png'; // Default fallback
            let pipeline = sharp(file.buffer, { animated: true });

            if (isAnimated) {
                if (metadata.format === 'gif') {
                    ext = '.gif';
                    pipeline = pipeline.gif();
                } else {
                    ext = '.webp';
                    pipeline = pipeline.webp();
                }
            } else {
                // Static image - convert to PNG for consistency/compatibility
                ext = '.png';
                pipeline = pipeline.png();
            }

            const fileName = `${emojiId}${ext}`;
            const filePath = path.join(UPLOADS_DIR, fileName);

            // Resize to 128x128 (maintaining aspect ratio)
            await pipeline
                .resize(128, 128, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 },
                })
                .toFile(filePath);

            const imageUrl = `/uploads/emojis/${fileName}`;

            // Create emoji record
            const emoji = await emojiRepo.create({
                name,
                imageUrl,
                serverId,
                createdBy: userId,
            });

            // Get emoji with populated creator info
            const populatedEmoji = await emojiRepo.findByIdWithCreator(
                emoji._id.toString(),
            );

            // Emit socket event to refresh emoji caches for all server members
            const io = getIO();
            io.to(`server:${serverId}`).emit('emoji_updated', { serverId });

            res.status(201).json(populatedEmoji);
        } catch (err: any) {
            logger.error('Failed to upload emoji:', err);
            res.status(500).json({ error: 'Failed to upload emoji' });
        }
    },
);

// Get a specific emoji
router.get(
    '/:serverId/emojis/:emojiId',
    authenticateToken,
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const { serverId, emojiId } = req.params;
            const userId = user.id;

            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }

            if (!serverId) {
                return res.status(400).json({ error: 'Server ID is required' });
            }

            if (!emojiId) {
                return res.status(400).json({ error: 'Emoji ID is required' });
            }

            // Check if user is a member of the server
            const server = await serverRepo.findById(serverId);
            if (!server) {
                return res.status(404).json({ error: 'Server not found' });
            }

            // Any server member can view emojis
            const isMember = await serverMemberRepo.findByServerAndUser(
                serverId,
                userId,
            );
            if (!isMember) {
                return res
                    .status(403)
                    .json({ error: 'Not a member of this server' });
            }

            const emoji = await emojiRepo.findById(emojiId);
            if (!emoji) {
                return res.status(404).json({ error: 'Emoji not found' });
            }

            res.json(emoji);
        } catch (err: any) {
            logger.error('Failed to get emoji:', err);
            res.status(500).json({ error: 'Failed to get emoji' });
        }
    },
);

/**
 * DELETE /:serverId/emojis/:emojiId
 * Delete a custom emoji from the server.
 * Requires 'manageServer' permission.
 */
router.delete(
    '/:serverId/emojis/:emojiId',
    authenticateToken,
    async (req, res) => {
        try {
            const { user } = req as AuthenticatedRequest;
            const { serverId, emojiId } = req.params;
            const userId = user.id;

            if (!userId) {
                return res.status(401).json({ error: 'unauthorized' });
            }

            if (!serverId) {
                return res.status(400).json({ error: 'Server ID is required' });
            }

            if (!emojiId) {
                return res.status(400).json({ error: 'Emoji ID is required' });
            }

            // Check permissions - owner or has manageServer permission
            const server = await serverRepo.findById(serverId);
            if (!server) {
                return res.status(404).json({ error: 'Server not found' });
            }

            const isOwner = server.ownerId.toString() === userId;
            if (
                !isOwner &&
                !(await permissionService.hasPermission(
                    serverId,
                    userId,
                    'manageServer',
                ))
            ) {
                return res
                    .status(403)
                    .json({ error: 'insufficient permissions' });
            }

            const emoji = await emojiRepo.findById(emojiId);
            if (!emoji) {
                return res.status(404).json({ error: 'Emoji not found' });
            }

            // Delete image file
            const filePath = path.join(process.cwd(), emoji.imageUrl);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            // Delete emoji record
            await emojiRepo.delete(emojiId);

            res.status(204).send();
        } catch (err: any) {
            logger.error('Failed to delete emoji:', err);
            res.status(500).json({ error: 'Failed to delete emoji' });
        }
    },
);

export default router;
