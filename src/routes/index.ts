import { Router } from 'express';
import publicRoutes from './public-routes';
import { topLevelRouter as webhooksTopLevelRoutes } from './api/v1/servers/webhooks';
import serversRoutes from './api/v1/servers/servers';
import adminRouter from './api/v1/admin/admin';
import { authenticateToken } from '../middleware/auth';

/**
 * Main API Router
 * Aggregates all API routes and public routes.
 */
const router: Router = Router();

// API must become before SPA
router.use('/api/v1/servers', serversRoutes);
router.use('/api/v1/webhooks', webhooksTopLevelRoutes);
router.use('/api/v1/admin', authenticateToken, adminRouter);

// Public routes (static files and SPA fallback) - comes after API routes
router.use('/', publicRoutes);

export default router;
