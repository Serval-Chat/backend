import { Router } from 'express';
import { PUBLIC_FOLDER_PATH } from '@/config/env';
import express from 'express';
import path from 'path';
import { readFileSync } from 'fs';

const router: Router = Router();

router.use('/uploads/profiles', express.static(path.join(process.cwd(), 'uploads', 'profiles')));
router.use('/uploads/banners', express.static(path.join(process.cwd(), 'uploads', 'banners')));
router.use('/uploads/emojis', express.static(path.join(process.cwd(), 'uploads', 'emojis')));
router.use('/uploads/stickers', express.static(path.join(process.cwd(), 'uploads', 'stickers')));

// Serve frontend static assets
router.use(express.static(PUBLIC_FOLDER_PATH));

let cachedHtml: string | null = null;

/**
 * SPA Fallback Handler
 * Serves index.html for any unknown non-API routes to support client-side routing.
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
        if (cachedHtml === null || process.env.PROJECT_LEVEL === 'development') {
            const htmlPath = path.resolve(PUBLIC_FOLDER_PATH, 'index.html');
            cachedHtml = readFileSync(htmlPath, 'utf8');
        }

        const nonce = typeof res.locals.cspNonce === 'string' ? res.locals.cspNonce : '';
        
        const html = cachedHtml.replace(/<script(?![^>]*nonce=)/gi, `<script nonce="${nonce}"`);

        res.set('Content-Type', 'text/html');
        res.send(html);
    } catch (error) {
        console.error('Error serving index.html:', error);
        res.status(500).send('Internal Server Error');
    }
});

export default router;
