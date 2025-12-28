import type express from 'express';
import { container } from '@/di/container';
import { TYPES } from '@/di/types';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import logger from '@/utils/logger';
import type { AdminPermissions } from '@/routes/api/v1/admin/permissions';

const userRepo = container.get<IUserRepository>(TYPES.UserRepository);

/**
 * Middleware to require admin permissions.
 *
 * Checks if the authenticated user has the required permission.
 * Also allows access if the user has 'adminAccess' (super admin).
 *
 * @param requiredPermission - The specific permission required for the route.
 */
export const requireAdmin = (requiredPermission: keyof AdminPermissions) => {
    return async (
        req: express.Request,
        res: express.Response,
        next: express.NextFunction,
    ) => {
        try {
            // @ts-ignore
            if (!req.user) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            // @ts-ignore
            const username = req.user.username;

            // Fetch user from database to get permissions
            const user = await userRepo.findByUsername(username);
            if (!user) {
                return res.status(401).json({ error: 'User not found' });
            }

            // If permissions is undefined or string (legacy), treat as no permissions
            if (!user.permissions || typeof user.permissions !== 'object') {
                return res
                    .status(403)
                    .json({ error: 'Insufficient permissions' });
            }

            // Check for adminAccess (super admin)
            if (!(user.permissions as any).adminAccess) {
                return res
                    .status(403)
                    .json({ error: 'Access denied - admin access required' });
            }

            // Check specific permission
            if (!(user.permissions as any)[requiredPermission]) {
                return res
                    .status(403)
                    .json({ error: 'Insufficient permissions' });
            }

            // @ts-ignore - Store user._id for later use
            req.user._id = user._id;
            next();
        } catch (error) {
            logger.error('[ADMIN] Middleware error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    };
};
