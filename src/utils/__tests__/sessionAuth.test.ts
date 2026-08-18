import {
    createSession,
    resolveSession,
    revokeSessionById,
    revokeAllSessionsForUser,
} from '../sessionAuth';

const mockSessionRepo = {
    create: jest.fn(),
    findByTokenHash: jest.fn(),
    findByUser: jest.fn(),
    touch: jest.fn().mockResolvedValue(undefined),
    deleteById: jest.fn(),
    deleteAllForUser: jest.fn(),
};

const mockRedisClient = {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue('OK'),
    expire: jest.fn().mockResolvedValue(1),
    del: jest.fn().mockResolvedValue(1),
};

const mockWsServer = {
    disconnectSession: jest.fn(),
    disconnectUser: jest.fn(),
};

jest.mock('@/di/container', () => ({
    container: {
        get: jest.fn((type: symbol) => {
            const key = type.toString();
            if (key.includes('SessionRepository')) return mockSessionRepo;
            if (key.includes('RedisService'))
                return { getClient: () => mockRedisClient };
            if (key.includes('WsServer')) return mockWsServer;
            throw new Error(`Unexpected container.get: ${key}`);
        }),
    },
}));

describe('sessionAuth', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createSession', () => {
        it('creates a session record and warms the Redis cache', async () => {
            mockSessionRepo.create.mockResolvedValue({
                snowflakeId: 'session-1',
                userId: 'user-1',
            });

            const { token, session } = await createSession(
                'user-1',
                'Mozilla/5.0',
                '1.2.3.4',
                '7d',
            );

            expect(token).toMatch(/^serchat_[0-9a-f]{64}$/);
            expect(session.snowflakeId).toBe('session-1');
            expect(mockSessionRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 'user-1',
                    userAgent: 'Mozilla/5.0',
                    ip: '1.2.3.4',
                    durationDays: 7,
                }),
            );
            expect(mockRedisClient.set).toHaveBeenCalledWith(
                expect.stringContaining('session:'),
                expect.any(String),
                'EX',
                7 * 24 * 60 * 60,
            );
        });

        it('falls back to 30 days for an unrecognised duration', async () => {
            mockSessionRepo.create.mockResolvedValue({
                snowflakeId: 'session-1',
                userId: 'user-1',
            });

            await createSession('user-1', 'ua', 'ip', 'not-a-real-duration');

            expect(mockSessionRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ durationDays: 30 }),
            );
        });
    });

    describe('resolveSession', () => {
        it('resolves from the Redis cache without touching Mongo when fresh', async () => {
            mockRedisClient.get.mockResolvedValue(
                JSON.stringify({
                    sessionId: 'session-1',
                    userId: 'user-1',
                    durationDays: 30,
                    lastSyncedAt: Date.now(),
                }),
            );

            const resolved = await resolveSession('serchat_raw-token');

            expect(resolved).toEqual({
                userId: 'user-1',
                sessionId: 'session-1',
            });
            expect(mockSessionRepo.findByTokenHash).not.toHaveBeenCalled();
        });

        it('falls back to Mongo and warms the cache on a Redis miss', async () => {
            mockRedisClient.get.mockResolvedValue(null);
            mockSessionRepo.findByTokenHash.mockResolvedValue({
                snowflakeId: 'session-1',
                userId: 'user-1',
                durationDays: 30,
            });

            const resolved = await resolveSession('serchat_raw-token');

            expect(resolved).toEqual({
                userId: 'user-1',
                sessionId: 'session-1',
            });
            expect(mockSessionRepo.touch).toHaveBeenCalled();
            expect(mockRedisClient.set).toHaveBeenCalled();
        });

        it('returns null when the token matches nothing in Redis or Mongo', async () => {
            mockRedisClient.get.mockResolvedValue(null);
            mockSessionRepo.findByTokenHash.mockResolvedValue(null);

            await expect(
                resolveSession('serchat_bogus-token'),
            ).resolves.toBeNull();
        });

        it('rejects a token without the serchat_ prefix before touching Redis or Mongo', async () => {
            await expect(
                resolveSession('not-a-serchat-token'),
            ).resolves.toBeNull();

            expect(mockRedisClient.get).not.toHaveBeenCalled();
            expect(mockSessionRepo.findByTokenHash).not.toHaveBeenCalled();
        });
    });

    describe('revokeSessionById', () => {
        it('deletes the record, clears the cache, and kicks the live socket', async () => {
            mockSessionRepo.deleteById.mockResolvedValue({
                snowflakeId: 'session-1',
                userId: 'user-1',
                tokenHash: 'hash-1',
            });

            const result = await revokeSessionById('session-1', 'user-1');

            expect(result).not.toBeNull();
            expect(mockRedisClient.del).toHaveBeenCalledWith('session:hash-1');
            expect(mockWsServer.disconnectSession).toHaveBeenCalledWith(
                'session-1',
                4003,
                'Session revoked',
            );
        });

        it('does nothing when the session does not belong to the caller', async () => {
            mockSessionRepo.deleteById.mockResolvedValue(null);

            const result = await revokeSessionById('session-1', 'user-2');

            expect(result).toBeNull();
            expect(mockWsServer.disconnectSession).not.toHaveBeenCalled();
        });
    });

    describe('revokeAllSessionsForUser', () => {
        it('kicks the whole user when nothing is excepted', async () => {
            mockSessionRepo.deleteAllForUser.mockResolvedValue([
                { snowflakeId: 's1', tokenHash: 'h1' },
                { snowflakeId: 's2', tokenHash: 'h2' },
            ]);

            await revokeAllSessionsForUser('user-1');

            expect(mockWsServer.disconnectUser).toHaveBeenCalledWith(
                'user-1',
                4003,
                'Session revoked',
            );
            expect(mockWsServer.disconnectSession).not.toHaveBeenCalled();
        });

        it('kicks only the other sessions when one is excepted', async () => {
            mockSessionRepo.deleteAllForUser.mockResolvedValue([
                { snowflakeId: 's2', tokenHash: 'h2' },
            ]);

            await revokeAllSessionsForUser('user-1', 's1');

            expect(mockWsServer.disconnectUser).not.toHaveBeenCalled();
            expect(mockWsServer.disconnectSession).toHaveBeenCalledWith(
                's2',
                4003,
                'Session revoked',
            );
        });
    });
});
