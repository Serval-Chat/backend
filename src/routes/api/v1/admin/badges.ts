import type { Request, Response } from 'express';
import { Router } from 'express';
import { authenticateToken } from '@/middleware/auth';
import logger from '@/utils/logger';
import { container } from '@/di/container';
import { TYPES } from '@/di/types';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import { Badge } from '@/models/Badge';
import { requireAdmin } from '@/routes/api/v1/admin/middlewares/requireAdmin';

const router: Router = Router();

// Get repositories from DI container
const userRepo = container.get<IUserRepository>(TYPES.UserRepository);

// GET /api/v1/admin/badges - Get all available badges
/**
 * GET /api/v1/admin/badges
 *
 * Retrieves all available badges, sorted by creation date.
 */
router.get(
    '/badges',
    requireAdmin('manageBadges'),
    async (req: Request, res: Response) => {
        try {
            const badges = await Badge.find().sort({ createdAt: 1 });
            res.status(200).send(badges);
        } catch (err) {
            logger.error('Error fetching badges:', err);
            res.status(500).send({ error: 'Failed to fetch badges' });
        }
    },
);

// POST /api/v1/admin/badges - Create a new badge
/**
 * POST /api/v1/admin/badges
 *
 * Creates a new badge with the specified details.
 * Validates that the badge ID is unique.
 */
router.post(
    '/badges',
    requireAdmin('manageBadges'),
    async (req: Request, res: Response) => {
        try {
            const { id, name, description, icon, color } = req.body;

            if (!id || !name || !description || !icon) {
                return res.status(400).send({
                    error: 'id, name, description, and icon are required',
                });
            }

            // Check if badge ID already exists
            const existingBadge = await Badge.findOne({ id });
            if (existingBadge) {
                return res
                    .status(409)
                    .send({ error: 'Badge ID already exists' });
            }

            const badge = new Badge({
                id,
                name,
                description,
                icon,
                color: color || '#3b82f6',
            });

            await badge.save();
            res.status(201).send(badge);
        } catch (err) {
            logger.error('Error creating badge:', err);
            res.status(500).send({ error: 'Failed to create badge' });
        }
    },
);

// PUT /api/v1/admin/badges/:badgeId - Update a badge
router.put(
    '/badges/:badgeId',
    requireAdmin('manageBadges'),
    async (req: Request, res: Response) => {
        try {
            const { badgeId } = req.params;
            const { name, description, icon, color } = req.body;

            const badge = await Badge.findOne({ id: badgeId });
            if (!badge) {
                return res.status(404).send({ error: 'Badge not found' });
            }

            if (name) badge.name = name;
            if (description) badge.description = description;
            if (icon) badge.icon = icon;
            if (color) badge.color = color;

            await badge.save();
            res.status(200).send(badge);
        } catch (err) {
            logger.error('Error updating badge:', err);
            res.status(500).send({ error: 'Failed to update badge' });
        }
    },
);

// DELETE /api/v1/admin/badges/:badgeId - Delete a badge
router.delete(
    '/badges/:badgeId',
    requireAdmin('manageBadges'),
    async (req: Request, res: Response) => {
        try {
            const { badgeId } = req.params;

            if (!badgeId) {
                return res.status(400).send({ error: 'Badge ID is required' });
            }

            const badge = await Badge.findOne({ id: badgeId });
            if (!badge) {
                return res.status(404).send({ error: 'Badge not found' });
            }

            await Badge.deleteOne({ id: badgeId });

            // Remove badge from all users who have it
            await userRepo.removeBadgeFromAllUsers(badgeId);

            res.status(200).send({ message: 'Badge deleted successfully' });
        } catch (err) {
            logger.error('Error deleting badge:', err);
            res.status(500).send({ error: 'Failed to delete badge' });
        }
    },
);

// GET /api/v1/admin/users/:userId/badges - Get user's badges
router.get(
    '/users/:userId/badges',
    requireAdmin('manageBadges'),
    async (req: Request, res: Response) => {
        try {
            const { userId } = req.params;

            if (!userId) {
                return res.status(400).send({ error: 'User ID is required' });
            }

            const user = await userRepo.findById(userId);
            if (!user) {
                return res.status(404).send({ error: 'User not found' });
            }

            const badgeIds = user.badges || [];
            const badges = await Badge.find({ id: { $in: badgeIds } });

            res.status(200).send(badges);
        } catch (err) {
            logger.error('Error fetching user badges:', err);
            res.status(500).send({ error: 'Failed to fetch user badges' });
        }
    },
);

// POST /api/v1/admin/users/:userId/badges - Add badge to user
router.post(
    '/users/:userId/badges',
    requireAdmin('manageBadges'),
    async (req: Request, res: Response) => {
        try {
            const { userId } = req.params;
            const { badgeId } = req.body;

            if (!userId) {
                return res.status(400).send({ error: 'User ID is required' });
            }

            if (!badgeId) {
                return res.status(400).send({ error: 'badgeId is required' });
            }

            const user = await userRepo.findById(userId);
            if (!user) {
                return res.status(404).send({ error: 'User not found' });
            }

            const badge = await Badge.findOne({ id: badgeId });
            if (!badge) {
                return res.status(404).send({ error: 'Badge not found' });
            }

            const badges = user.badges || [];
            if (badges.includes(badgeId)) {
                return res
                    .status(409)
                    .send({ error: 'User already has this badge' });
            }

            badges.push(badgeId);
            await userRepo.update(user._id.toString(), { badges });

            res.status(200).send({
                message: 'Badge added successfully',
                badges,
            });
        } catch (err) {
            logger.error('Error adding badge to user:', err);
            res.status(500).send({ error: 'Failed to add badge to user' });
        }
    },
);

// DELETE /api/v1/admin/users/:userId/badges/:badgeId - Remove badge from user
router.delete(
    '/users/:userId/badges/:badgeId',
    requireAdmin('manageBadges'),
    async (req: Request, res: Response) => {
        try {
            const { userId, badgeId } = req.params;

            if (!userId) {
                return res.status(400).send({ error: 'User ID is required' });
            }

            if (!badgeId) {
                return res.status(400).send({ error: 'badgeId is required' });
            }

            const user = await userRepo.findById(userId);
            if (!user) {
                return res.status(404).send({ error: 'User not found' });
            }

            const badges = user.badges || [];
            const index = badges.indexOf(badgeId);
            if (index === -1) {
                return res
                    .status(404)
                    .send({ error: 'User does not have this badge' });
            }

            badges.splice(index, 1);
            await userRepo.update(user._id.toString(), { badges });

            res.status(200).send({
                message: 'Badge removed successfully',
                badges,
            });
        } catch (err) {
            logger.error('Error removing badge from user:', err);
            res.status(500).send({ error: 'Failed to remove badge from user' });
        }
    },
);

export default router;
