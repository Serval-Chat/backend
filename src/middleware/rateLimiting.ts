import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import type { RedisReply } from 'rate-limit-redis';
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
        const ip = req.ip || req.socket.remoteAddress || 'ip';
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
        return userId || req.ip || 'unknown';
    },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Too many password change attempts, please try again later.',
    skipSuccessfulRequests: true, // Don't count successful operations
});
