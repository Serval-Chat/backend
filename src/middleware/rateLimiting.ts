import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import type { RedisReply } from 'rate-limit-redis';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/config/env';
import type { JWTPayload } from '@/utils/jwt';
import { container } from '@/di/container';
import { TYPES } from '@/di/types';
import type { IRedisService } from '@/di/interfaces/IRedisService';

function getStore(prefix: string) {
    return new RedisStore({
        sendCommand: async (...args: string[]): Promise<RedisReply> => {
            if (args.length === 0) return null as unknown as RedisReply;
            const client = container
                .get<IRedisService>(TYPES.RedisService)
                .getClient();
            const command = args[0] as string;
            const cmdArgs = args.slice(1);
            return client.call(
                command,
                ...cmdArgs,
            ) as unknown as Promise<RedisReply>;
        },
        prefix,
    });
}

// Rate limiter for login attempts.
//
// Limits to 5 attempts per minute per IP+login combination.
export const loginLimiter = rateLimit({
    ...(process.env.NODE_ENV !== 'test'
        ? { store: getStore('rl:login:') }
        : {}),
    windowMs: 60_000, // 1 minute
    max: 5,
    keyGenerator: (req: Request) => {
        const login =
            typeof req.body?.login === 'string'
                ? req.body.login.toLowerCase()
                : '';
        const ip = req.ip ?? req.socket.remoteAddress ?? 'ip';
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
    ...(process.env.NODE_ENV !== 'test' ? { store: getStore('rl:reg:') } : {}),
    windowMs: 60_000, // 1 minute
    max: 3,
    keyGenerator: (req: Request) => {
        const login =
            typeof req.body?.login === 'string'
                ? req.body.login.toLowerCase()
                : '';
        const inviteCode =
            typeof req.body?.inviteCode === 'string' ? req.body.inviteCode : '';
        const ip = req.ip ?? req.socket.remoteAddress ?? 'ip';
        return `${ip}:${login}:${inviteCode}`;
    },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Too many registration attempts, please wait and try again.',
});

// Rate limiter for sensitive authenticated operations.
export const sensitiveOperationLimiter = rateLimit({
    ...(process.env.NODE_ENV !== 'test' ? { store: getStore('rl:sens:') } : {}),
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
    keyGenerator: (req: Request) => {
        const userId = (req as Request & { user?: JWTPayload }).user?.id;
        return userId ?? req.ip ?? 'unknown';
    },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Too many password change attempts, please try again later.',
    skipSuccessfulRequests: true, // Don't count successful operations
});

// Rate limiter for password reset email requests.
//
// Limits to 5 attempts per hour per IP+email combination.
export const passwordResetLimiter = rateLimit({
    ...(process.env.NODE_ENV !== 'test'
        ? { store: getStore('rl:password-reset:') }
        : {}),
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    keyGenerator: (req: Request) => {
        const email =
            typeof req.body?.email === 'string'
                ? req.body.email.toLowerCase()
                : '';
        const ip = req.ip ?? req.socket.remoteAddress ?? 'ip';
        return `${ip}:${email}`;
    },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Too many password reset attempts, please try again later.',
});

// Rate limiter for bot client-credentials exchanges.
//
// Limits to 10 attempts per minute per IP+client_id combination.
export const botTokenLimiter = rateLimit({
    ...(process.env.NODE_ENV !== 'test'
        ? { store: getStore('rl:bot-token:') }
        : {}),
    windowMs: 60_000,
    max: 10,
    keyGenerator: (req: Request) => {
        const clientId =
            typeof req.body?.client_id === 'string' ? req.body.client_id : '';
        const ip = req.ip ?? req.socket.remoteAddress ?? 'ip';
        return `${ip}:${clientId}`;
    },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Too many bot token attempts, please try again later.',
});

// Rate limiter for public webhook execution.
//
// Limits each webhook token to 60 deliveries per minute, with an IP fallback.
export const webhookExecutionLimiter = rateLimit({
    ...(process.env.NODE_ENV !== 'test'
        ? { store: getStore('rl:webhook:') }
        : {}),
    windowMs: 60_000,
    max: 60,
    keyGenerator: (req: Request) => {
        const token =
            typeof req.params.token === 'string' ? req.params.token : '';
        return token !== '' ? token : (req.ip ?? 'unknown');
    },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Too many webhook requests, please try again later.',
});

export const messageSearchLimiter = rateLimit({
    ...(process.env.NODE_ENV !== 'test'
        ? { store: getStore('rl:message-search:') }
        : {}),
    windowMs: 60_000,
    max: 30,
    keyGenerator: authenticatedUserKey,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Too many search requests, please try again later.',
});

export const discoverySearchLimiter = rateLimit({
    ...(process.env.NODE_ENV !== 'test'
        ? { store: getStore('rl:discovery:search:') }
        : {}),
    windowMs: 60_000,
    max: 60,
    keyGenerator: authenticatedUserKey,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Too many discovery searches, please try again later.',
});

export const discoverySettingsLimiter = rateLimit({
    ...(process.env.NODE_ENV !== 'test'
        ? { store: getStore('rl:discovery:settings:') }
        : {}),
    windowMs: 60_000,
    max: 20,
    keyGenerator: (req: Request) => {
        const serverId =
            typeof req.params.serverId === 'string' ? req.params.serverId : '';
        return `${authenticatedUserKey(req)}:${serverId}`;
    },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Too many discovery setting updates, please try again later.',
});

function authenticatedUserKey(req: Request): string {
    const guardedUserId = (req as Request & { user?: JWTPayload }).user?.id;
    if (guardedUserId !== undefined) return guardedUserId;

    const header = req.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
        try {
            const payload = jwt.verify(
                header.slice('Bearer '.length),
                JWT_SECRET,
            ) as JWTPayload;
            if (payload.type === undefined || payload.type === 'access') {
                return payload.id;
            }
        } catch {
            // Fall back to IP for malformed or expired tokens.
        }
    }

    return req.ip ?? 'unknown';
}

export const websiteConnectionCreateLimiter = rateLimit({
    ...(process.env.NODE_ENV !== 'test'
        ? { store: getStore('rl:website-connection:create:') }
        : {}),
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyGenerator: authenticatedUserKey,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Too many website connection requests, please try again later.',
});

export const websiteConnectionVerifyLimiter = rateLimit({
    ...(process.env.NODE_ENV !== 'test'
        ? { store: getStore('rl:website-connection:verify:') }
        : {}),
    windowMs: 60 * 60 * 1000,
    max: 10,
    keyGenerator: authenticatedUserKey,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Too many website verification attempts, please try again later.',
});

export const websiteConnectionRemoveLimiter = rateLimit({
    ...(process.env.NODE_ENV !== 'test'
        ? { store: getStore('rl:website-connection:remove:') }
        : {}),
    windowMs: 60 * 60 * 1000,
    max: 30,
    keyGenerator: authenticatedUserKey,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message:
        'Too many website connection removal requests, please try again later.',
});
