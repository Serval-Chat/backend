import type { NextFunction, Request, Response } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import crypto from 'node:crypto';

import { container } from '@/di/container';
import { TYPES } from '@/di/types';
import type { IRedisService } from '@/di/interfaces/IRedisService';
import { ErrorMessages } from '@/constants/errorMessages';

export const BACKOFF_FREE_ATTEMPTS = 2;
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_MAX_MS = 300_000;
export const BACKOFF_WINDOW_SECONDS = 3600;

export function backoffFor(failures: number): number {
    if (failures <= BACKOFF_FREE_ATTEMPTS) return 0;
    const step = failures - BACKOFF_FREE_ATTEMPTS - 1;
    return Math.min(BACKOFF_BASE_MS * 2 ** step, BACKOFF_MAX_MS);
}

function sourceKey(req: Request): string {
    const login =
        typeof req.body?.login === 'string' ? req.body.login.toLowerCase() : '';
    const ip = ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'ip');
    return `login:backoff:${crypto
        .createHash('sha256')
        .update(`${ip}|${login}`)
        .digest('hex')}`;
}

function rejectAsInvalid(res: Response): void {
    res.status(401).json({ error: ErrorMessages.AUTH.INVALID_CREDENTIALS });
}

export async function loginBackoff(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    let redis;
    try {
        redis = container.get<IRedisService>(TYPES.RedisService).getClient();
    } catch {
        next();
        return;
    }

    const key = sourceKey(req);

    let state: { failures: number; nextAllowedAt: number } | null = null;
    try {
        const raw = await redis.get(key);
        if (raw !== null) {
            state = JSON.parse(raw) as {
                failures: number;
                nextAllowedAt: number;
            };
        }
    } catch {
        next();
        return;
    }

    if (state !== null && Date.now() < state.nextAllowedAt) {
        rejectAsInvalid(res);
        return;
    }

    const originalEnd = res.end.bind(res);
    let recorded = false;

    res.end = function patchedEnd(
        this: Response,
        ...args: Parameters<typeof originalEnd>
    ) {
        if (!recorded) {
            recorded = true;
            const succeeded = res.statusCode >= 200 && res.statusCode < 300;
            const failed = res.statusCode === 401;

            void (async () => {
                try {
                    if (succeeded) {
                        await redis.del(key);
                    } else if (failed) {
                        const failures = (state?.failures ?? 0) + 1;
                        await redis.set(
                            key,
                            JSON.stringify({
                                failures,
                                nextAllowedAt:
                                    Date.now() + backoffFor(failures),
                            }),
                            'EX',
                            BACKOFF_WINDOW_SECONDS,
                        );
                    }
                } catch {
                    recorded = true;
                }
            })();
        }
        return originalEnd(...args);
    } as typeof res.end;

    next();
}
