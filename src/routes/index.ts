import { Router } from 'express';
import publicRoutes from '@/routes/public-routes';

import badgeRoutes from '@/routes/api/v1/admin/badges';
import inviteRoutes from '@/routes/api/v1/admin/invites';
import { authenticateToken } from '@/middleware/auth';

/**
 * Main API Router.
 *
 * Aggregates all API routes and public routes.
 */
const router: Router = Router();

// API must be defined before SPA routes

router.use('/api/v1/admin', authenticateToken, badgeRoutes);
router.use('/api/v1/admin/invites', authenticateToken, inviteRoutes);

// Public routes (static files and SPA fallback) - comes after API routes
router.use('/', publicRoutes);

export default router;
