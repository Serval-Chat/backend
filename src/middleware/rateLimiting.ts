import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import type { JWTPayload } from '@/utils/jwt';

// Rate limiter for login attempts.
//
// Limits to 5 attempts per minute per IP+login combination.
export const loginLimiter = rateLimit({
    windowMs: 60_000, // 1 minute
    max: 5,
    keyGenerator: (req: Request) => {
        const login =
            typeof req.body?.login === 'string'
                ? req.body.login.toLowerCase()
                : '';
        const ip = req.ip || req.socket.remoteAddress || 'ip';
        return `${ip}:${login}`;
    },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Too many login attempts, please wait and try again.',
});

// Rate limiter for registration attempts.
//
// Limits to 3 attempts per minute per IP+login+invite combination.
export const registrationLimiter = rateLimit({
    windowMs: 60_000, // 1 minute
    max: 3,
    keyGenerator: (req: Request) => {
        const login =
            typeof req.body?.login === 'string'
                ? req.body.login.toLowerCase()
                : '';
        const inviteCode =
            typeof req.body?.inviteCode === 'string' ? req.body.inviteCode : '';
        const ip = req.ip || req.socket.remoteAddress || 'ip';
        return `${ip}:${login}:${inviteCode}`;
    },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Too many registration attempts, please wait and try again.',
});

// Rate limiter for sensitive authenticated operations.
export const sensitiveOperationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
    keyGenerator: (req: Request) => {
        const userId = (req as Request & { user?: JWTPayload }).user?.id;
        return userId || req.ip || 'unknown';
    },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Too many password change attempts, please try again later.',
    skipSuccessfulRequests: true, // Don't count successful operations
});
