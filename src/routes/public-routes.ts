import { Router } from 'express';
import { PUBLIC_FOLDER_PATH } from '../config/env';
import express from 'express';
import path from 'path';
import { readFileSync } from 'fs';

const router: Router = Router();

// Serve user generated content
router.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Serve frontend static assets
router.use(express.static(PUBLIC_FOLDER_PATH));

/**
 * SPA Fallback Handler
 * Serves index.html for any unknown non-API routes to support client-side routing.
 * Excludes:
 * - /api/* (API endpoints)
 * - /docs/* (Documentation)
 * - /socket.io/* (Realtime)
 */
router.get('*', (req, res, next) => {
    // Skip API routes - they should be handled by API router
    if (req.path.startsWith('/api/')) {
        return next();
    }

    // Skip Swagger UI
    if (req.path.startsWith('/docs')) {
        return next();
    }

    // Skip socket.io routes
    if (req.path.startsWith('/socket.io/')) {
        return next();
    }

    try {
        const htmlPath = path.resolve(PUBLIC_FOLDER_PATH, 'index.html');
        let html = readFileSync(htmlPath, 'utf8');

        // Inject CSP nonce
        const nonce = res.locals.cspNonce || '';
        html = html.replace(/<script/g, `<script nonce="${nonce}"`);

        res.send(html);
    } catch (error) {
        console.error('Error serving index.html:', error);
        res.status(500).send('Internal Server Error');
    }
});

export default router;
