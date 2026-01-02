import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { JWT_SECRET } from '@/config/env';
import logger from '@/utils/logger';
import type { JWTPayload } from '@/utils/jwt';
import { Ban } from '@/models/Ban';
import { User } from '@/models/User';
import { Types } from 'mongoose';

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
//
// Security mitigations:
// - validates token existence and format (Bearer).
// - checks if the account is soft-deleted.
// - validates 'tokenVersion' to support global logout/session invalidation.
// - checks for active bans (including automated expiration).
// - prevents re-authentication if 'req.user' is already set.
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

    if (!token) {
        // Return JSON error for API requests, redirect for web requests
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'No token provided' });
        }
        return res.redirect('/login.html');
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;

        // Check if account is deleted and validate tokenVersion
        const user = await User.findById(decoded.id)
            .select('deletedAt tokenVersion username')
            .lean();

        if (!user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        if (user.deletedAt) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        // Validate tokenVersion to invalidate old JWTs
        const currentTokenVersion = user.tokenVersion || 0;
        const payloadTokenVersion = decoded.tokenVersion || 0;

        if (currentTokenVersion !== payloadTokenVersion) {
            return res.status(401).json({ error: 'Token expired' });
        }

        let userObjectId: Types.ObjectId;
        try {
            userObjectId = new Types.ObjectId(decoded.id);
        } catch {
            logger.error(
                '[AUTH] Invalid user ID in token payload:',
                decoded.id,
            );
            return res.status(401).json({ error: 'Invalid token payload' });
        }

        try {
            await Ban.checkExpired(userObjectId);
            const activeBan = await Ban.findOne({
                userId: userObjectId,
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
        } catch (banErr) {
            logger.error('[AUTH] Ban check failed for user:', {
                username: decoded.username,
                error: banErr,
            });
            return res
                .status(500)
                .json({ error: 'Failed to verify account status' });
        }

        const existingDescriptor = Object.getOwnPropertyDescriptor(req, 'user');
        if (existingDescriptor) {
            const existingUser = existingDescriptor.value as
                | JWTPayload
                | undefined;

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

        next();
    } catch (err) {
        logger.warn('Token verification failed', {
            path: req.path,
            error: err instanceof Error ? err.message : String(err),
        });
        // Return JSON error for API requests, redirect for web requests
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        res.redirect('/login.html');
    }
};
