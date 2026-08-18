import crypto from 'crypto';
import { TYPES } from '@/di/types';
import type { container as Container } from '@/di/container';
import type { IRedisService } from '@/di/interfaces/IRedisService';
import type { ISessionRepository } from '@/di/interfaces/ISessionRepository';
import type { IUserSession } from '@/models/UserSession';
import type { IWsServer } from '@/ws/interfaces/IWsServer';
import logger from '@/utils/logger';

const SESSION_TOUCH_THRESHOLD_MS = 5 * 60 * 1000;
const SESSION_REVOKED_CLOSE_CODE = 4003;
const DEFAULT_SESSION_DURATION = '30d';
const TOKEN_PREFIX = 'serchat_';
const SESSION_DURATION_DAYS: Record<string, number> = {
    '1d': 1,
    '7d': 7,
    '30d': 30,
    '90d': 90,
};

interface CachedSession {
    sessionId: string;
    userId: string;
    durationDays: number;
    lastSyncedAt: number;
}

export interface ResolvedSession {
    userId: string;
    sessionId: string;
}

function getContainer(): typeof Container {
    return (require('@/di/container') as { container: typeof Container })
        .container;
}

function sessionRepo(): ISessionRepository {
    return getContainer().get<ISessionRepository>(TYPES.SessionRepository);
}

function redisClient() {
    return getContainer().get<IRedisService>(TYPES.RedisService).getClient();
}

function wsServer(): IWsServer {
    return getContainer().get<IWsServer>(TYPES.WsServer);
}

function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function redisKey(tokenHash: string): string {
    return `session:${tokenHash}`;
}

export async function createSession(
    userId: string,
    userAgent: string,
    ip: string,
    duration: string = DEFAULT_SESSION_DURATION,
): Promise<{ token: string; session: IUserSession }> {
    const token = TOKEN_PREFIX + crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const durationDays = SESSION_DURATION_DAYS[duration] ?? 30;
    const ttlSeconds = durationDays * 24 * 60 * 60;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const session = await sessionRepo().create({
        userId,
        tokenHash,
        userAgent: userAgent.slice(0, 512),
        ip,
        durationDays,
        expiresAt,
    });

    const cached: CachedSession = {
        sessionId: session.snowflakeId,
        userId,
        durationDays,
        lastSyncedAt: Date.now(),
    };
    await redisClient()
        .set(redisKey(tokenHash), JSON.stringify(cached), 'EX', ttlSeconds)
        .catch((err) =>
            logger.error('[sessionAuth] Redis write failed on create', err),
        );

    return { token, session };
}

export async function resolveSession(
    token: string,
): Promise<ResolvedSession | null> {
    if (!token.startsWith(TOKEN_PREFIX)) return null;

    const tokenHash = hashToken(token);
    const key = redisKey(tokenHash);
    const redis = redisClient();
    const now = Date.now();

    let cached: CachedSession | null = null;
    try {
        const raw = await redis.get(key);
        if (raw !== null) cached = JSON.parse(raw) as CachedSession;
    } catch (err) {
        logger.error('[sessionAuth] Redis read failed, falling back', err);
    }

    if (cached !== null) {
        const ttlSeconds = cached.durationDays * 24 * 60 * 60;
        void redis
            .expire(key, ttlSeconds)
            .catch((err) =>
                logger.error('[sessionAuth] Redis TTL refresh failed', err),
            );

        if (now - cached.lastSyncedAt > SESSION_TOUCH_THRESHOLD_MS) {
            const expiresAt = new Date(now + ttlSeconds * 1000);
            void sessionRepo()
                .touch(tokenHash, new Date(now), expiresAt)
                .catch((err) =>
                    logger.error('[sessionAuth] Mongo sync failed', err),
                );
            const refreshed: CachedSession = { ...cached, lastSyncedAt: now };
            void redis
                .set(key, JSON.stringify(refreshed), 'KEEPTTL')
                .catch(() => {});
        }

        return { userId: cached.userId, sessionId: cached.sessionId };
    }

    const session = await sessionRepo().findByTokenHash(tokenHash);
    if (session === null) return null;

    const ttlSeconds = session.durationDays * 24 * 60 * 60;
    const expiresAt = new Date(now + ttlSeconds * 1000);
    await sessionRepo().touch(tokenHash, new Date(now), expiresAt);

    const warmed: CachedSession = {
        sessionId: session.snowflakeId,
        userId: session.userId,
        durationDays: session.durationDays,
        lastSyncedAt: now,
    };
    await redis
        .set(key, JSON.stringify(warmed), 'EX', ttlSeconds)
        .catch((err) => logger.error('[sessionAuth] Redis warm failed', err));

    return { userId: session.userId, sessionId: session.snowflakeId };
}

export async function touchSessionByHash(tokenHash: string): Promise<void> {
    const key = redisKey(tokenHash);
    const redis = redisClient();
    const now = Date.now();

    try {
        const raw = await redis.get(key);
        if (raw === null) return;
        const cached = JSON.parse(raw) as CachedSession;
        const ttlSeconds = cached.durationDays * 24 * 60 * 60;
        await redis.expire(key, ttlSeconds);

        if (now - cached.lastSyncedAt > SESSION_TOUCH_THRESHOLD_MS) {
            const expiresAt = new Date(now + ttlSeconds * 1000);
            await sessionRepo().touch(tokenHash, new Date(now), expiresAt);
            const refreshed: CachedSession = { ...cached, lastSyncedAt: now };
            await redis.set(key, JSON.stringify(refreshed), 'KEEPTTL');
        }
    } catch (err) {
        logger.error('[sessionAuth] Heartbeat TTL refresh failed', err);
    }
}

export async function revokeSessionById(
    sessionId: string,
    userId: string,
): Promise<IUserSession | null> {
    const session = await sessionRepo().deleteById(sessionId, userId);
    if (session !== null) {
        await redisClient()
            .del(redisKey(session.tokenHash))
            .catch((err) =>
                logger.error('[sessionAuth] Redis cleanup failed', err),
            );
        wsServer().disconnectSession(
            session.snowflakeId,
            SESSION_REVOKED_CLOSE_CODE,
            'Session revoked',
        );
    }
    return session;
}

export async function revokeAllSessionsForUser(
    userId: string,
    exceptSessionId?: string,
): Promise<IUserSession[]> {
    const sessions = await sessionRepo().deleteAllForUser(
        userId,
        exceptSessionId,
    );
    if (sessions.length === 0) return sessions;

    await redisClient()
        .del(...sessions.map((session) => redisKey(session.tokenHash)))
        .catch((err) =>
            logger.error('[sessionAuth] Redis bulk cleanup failed', err),
        );

    if (exceptSessionId === undefined) {
        wsServer().disconnectUser(
            userId,
            SESSION_REVOKED_CLOSE_CODE,
            'Session revoked',
        );
    } else {
        for (const session of sessions) {
            wsServer().disconnectSession(
                session.snowflakeId,
                SESSION_REVOKED_CLOSE_CODE,
                'Session revoked',
            );
        }
    }

    return sessions;
}
