import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import logger from '@/utils/logger';
import type { JWTPayload } from '@/utils/jwt';
import { Ban } from '@/models/Ban';
import { User } from '@/models/User';
import { resolveBotAuthPayload } from '@/utils/botAuth';
import { resolveSession } from '@/utils/sessionAuth';

declare module 'express-serve-static-core' {
    interface Request {
        user?: JWTPayload;
    }
}

// Request interface for authenticated requests where 'user' is guaranteed to exist.
export interface AuthenticatedRequest extends Request {
    user: JWTPayload;
}

// Authenticate JWT token from request headers.
export const authenticateToken = async (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    const authHeader = req.headers['authorization'];
    const token =
        typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
            ? authHeader.slice('Bearer '.length).trim()
            : undefined;

    if (token === undefined || token === '') {
        // Return JSON error for API requests, redirect for web requests
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'No token provided' });
        }
        return res.redirect('/login.html');
    }

    const resolved = await resolveSession(token);

    try {
        if (resolved !== null) {
            const user = await User.findOne({
                snowflakeId: resolved.userId,
            }).lean();
            if (!user || user.deletedAt) {
                return res.status(401).json({ error: 'Invalid token' });
            }

            const decoded: JWTPayload = {
                type: 'access',
                id: resolved.userId,
                login: user.login,
                username: user.username,
                isBot: user.isBot ?? false,
                sessionId: resolved.sessionId,
            };

            await Ban.checkExpired(resolved.userId);
            const activeBan = await Ban.findOne({
                userId: resolved.userId,
                active: true,
            });
            if (activeBan) {
                return res.status(403).json({
                    error: 'Account banned',
                    ban: {
                        reason: activeBan.reason,
                        expirationTimestamp: activeBan.expirationTimestamp,
                    },
                });
            }

            const existingDescriptor = Object.getOwnPropertyDescriptor(
                req,
                'user',
            );
            if (existingDescriptor) {
                const existingUser = existingDescriptor.value as
                    JWTPayload | undefined;
                if (
                    existingUser &&
                    existingDescriptor.writable === false &&
                    existingDescriptor.configurable === false &&
                    existingUser.id === decoded.id
                ) {
                    return next();
                }
                logger.warn('Request user already set before authentication', {
                    path: req.path,
                });
                return res
                    .status(401)
                    .json({ error: 'Invalid authentication state' });
            }

            Object.defineProperty(req, 'user', {
                value: decoded,
                writable: false,
                configurable: false,
                enumerable: true,
            });
            return next();
        }

        const tokenHash = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');
        const botPayload = await resolveBotAuthPayload(tokenHash);

        if (botPayload === null) {
            if (req.path.startsWith('/api/')) {
                return res.status(401).json({ error: 'Invalid token' });
            }
            return res.redirect('/login.html');
        }

        Object.defineProperty(req, 'user', {
            value: botPayload,
            writable: false,
            configurable: false,
            enumerable: true,
        });
        return next();
    } catch (err) {
        logger.warn('Token verification failed', {
            path: req.path,
            error: err instanceof Error ? err.message : String(err),
        });
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        return res.redirect('/login.html');
    }
};
