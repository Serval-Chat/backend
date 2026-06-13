import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { JWT_SECRET } from '@/config/env';
import logger from '@/utils/logger';
import type { JWTPayload } from '@/utils/jwt';
import { Ban } from '@/models/Ban';
import { User } from '@/models/User';
import { Bot } from '@/models/Bot';
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

    let decoded: JWTPayload | null = null;
    try {
        const verified = jwt.verify(token, JWT_SECRET) as JWTPayload;
        if (verified.type === 'access') decoded = verified;
    } catch {
        console.error('Invalid JWT token');
    }

    try {
        if (decoded !== null) {
            const user = await User.findById(decoded.id).lean();
            if (!user || user.deletedAt) {
                return res.status(401).json({ error: 'Invalid token' });
            }

            if (
                Number(user.tokenVersion ?? 0) !== Number(decoded.tokenVersion)
            ) {
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

            const existingDescriptor = Object.getOwnPropertyDescriptor(
                req,
                'user',
            );
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
            return next();
        }

        const tokenHash = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');
        const bot = await Bot.findOne({ botTokenHash: tokenHash })
            .select('+botTokenHash')
            .populate('userId', 'username tokenVersion deletedAt isBot')
            .lean();

        if (!bot) {
            if (req.path.startsWith('/api/')) {
                return res.status(401).json({ error: 'Invalid token' });
            }
            return res.redirect('/login.html');
        }

        const botUser = bot.userId as unknown as {
            _id: Types.ObjectId;
            username: string;
            tokenVersion: number;
            deletedAt?: Date;
            isBot: boolean;
        };

        if (botUser.deletedAt !== undefined) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const botPayload: JWTPayload = {
            type: 'access',
            id: botUser._id.toString(),
            login: `bot.${bot.clientId}`,
            username: botUser.username,
            tokenVersion: botUser.tokenVersion,
            isBot: true,
        };

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
