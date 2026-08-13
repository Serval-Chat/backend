import type { Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
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
            if (args.length === 0) return '';
            const client = container
                .get<IRedisService>(TYPES.RedisService)
                .getClient();
            const command = args[0] as string;
            const cmdArgs = args.slice(1);
            return client.call(command, ...cmdArgs) as Promise<RedisReply>;
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
        const ip = ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'ip');
        return `${ip}:${login}`;
    },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Too many login attempts, please wait and try again.',
});

// Rate limiter for registration attempts.
//
// Limits to 3 attempts per minute per IP.
export const registrationLimiter = rateLimit({
    ...(process.env.NODE_ENV !== 'test' ? { store: getStore('rl:reg:') } : {}),
    windowMs: 60_000, // 1 minute
    max: 3,
    keyGenerator: (req: Request) =>
        ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'ip'),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Too many registration attempts, please wait and try again.',
});

// Rate limiter for sensitive authenticated operations.
export const sensitiveOperationLimiter = rateLimit({
    ...(process.env.NODE_ENV !== 'test' ? { store: getStore('rl:sens:') } : {}),
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
    keyGenerator: authenticatedUserKey,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Too many password change attempts, please try again later.',
    skipSuccessfulRequests: true, // Don't count successful operations
});

// Rate limiter for TOTP verification.
export const twoFactorVerifyLimiter = rateLimit({
    ...(process.env.NODE_ENV !== 'test'
        ? { store: getStore('rl:2fa-verify:') }
        : {}),
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyGenerator: twoFactorSubjectKey,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Too many verification attempts, please try again later.',
    skipSuccessfulRequests: true,
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
        const ip = ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'ip');
        return `${ip}:${email}`;
    },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Too many password reset attempts, please try again later.',
});

// Rate limiter for bot token creation and rotation.
//
// Limits to 10 attempts per minute per IP+clientId combination.
export const botTokenLimiter = rateLimit({
    ...(process.env.NODE_ENV !== 'test'
        ? { store: getStore('rl:bot-token:') }
        : {}),
    windowMs: 60_000,
    max: 10,
    keyGenerator: (req: Request) => {
        const clientId =
            typeof req.params.clientId === 'string' ? req.params.clientId : '';
        const ip = ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'ip');
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
        return token !== '' ? token : ipKeyGenerator(req.ip ?? 'unknown');
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

// Rate limiter for password reset confirmations.
export const passwordResetConfirmLimiter = rateLimit({
    ...(process.env.NODE_ENV !== 'test'
        ? { store: getStore('rl:password-reset-confirm:') }
        : {}),
    windowMs: 60 * 60 * 1000,
    max: 10,
    keyGenerator: (req: Request) =>
        ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'ip'),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Too many password reset attempts, please try again later.',
});

/**
 * Bucket key for TOTP verification: the account named by the temp token.
 *
 * Falls back to the IP when the token is missing, malformed or not a temp
 * token, so a client cannot escape the limit by omitting it.
 */
function twoFactorSubjectKey(req: Request): string {
    const tempToken = req.body?.tempToken;
    if (typeof tempToken === 'string' && tempToken !== '') {
        try {
            const payload = jwt.verify(tempToken, JWT_SECRET, {
                algorithms: ['HS256'],
            }) as JWTPayload;
            if (
                payload.type === '2fa_temp' &&
                payload.scope === 'auth:2fa:verify' &&
                typeof payload.id === 'string'
            ) {
                return `2fa:${payload.id}`;
            }
        } catch {
            // Fall through to the IP.
        }
    }

    return ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'ip');
}

function authenticatedUserKey(req: Request): string {
    const guardedUserId = (req as Request & { user?: JWTPayload }).user?.id;
    if (guardedUserId !== undefined) return guardedUserId;

    const header = req.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
        try {
            const payload = jwt.verify(
                header.slice('Bearer '.length),
                JWT_SECRET,
                { algorithms: ['HS256'] },
            ) as JWTPayload;
            if (payload.type === 'access') {
                return payload.id;
            }
        } catch {
            // Fall back to IP for malformed or expired tokens.
        }
    }

    return ipKeyGenerator(req.ip ?? 'unknown');
}

export const gifTagCreateLimiter = rateLimit({
    ...(process.env.NODE_ENV !== 'test'
        ? { store: getStore('rl:gif-tag:create:') }
        : {}),
    windowMs: 60_000,
    max: 20,
    keyGenerator: authenticatedUserKey,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Too many tags created, please try again later.',
});

export const gifTagBulkLimiter = rateLimit({
    ...(process.env.NODE_ENV !== 'test'
        ? { store: getStore('rl:gif-tag:bulk:') }
        : {}),
    windowMs: 60_000,
    max: 60,
    keyGenerator: authenticatedUserKey,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Too many tag updates, please try again later.',
});

export const gifTagSearchLimiter = rateLimit({
    ...(process.env.NODE_ENV !== 'test'
        ? { store: getStore('rl:gif-tag:search:') }
        : {}),
    windowMs: 60_000,
    max: 30,
    keyGenerator: authenticatedUserKey,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Too many tag searches, please try again later.',
});

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

export const API_FLOOR_WINDOW_MS = 60_000;
export const API_FLOOR_MAX = 600;

export const apiFloorLimiter = rateLimit({
    ...(process.env.NODE_ENV !== 'test'
        ? { store: getStore('rl:api-floor:') }
        : {}),
    windowMs: API_FLOOR_WINDOW_MS,
    max: API_FLOOR_MAX,
    keyGenerator: authenticatedUserKey,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Too many requests, please slow down.',
});
