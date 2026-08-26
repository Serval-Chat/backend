import { assertSlowModeAllows } from '../slowMode';
import { ApiError } from '@/utils/ApiError';

const CHANNEL = '0254710804526399488';
const USER = '0254710804526399489';

const claim = (redis: unknown, messageRepo: unknown, cooldownMs: number) =>
    assertSlowModeAllows(
        { getClient: () => redis } as never,
        messageRepo as never,
        CHANNEL,
        USER,
        cooldownMs,
    );

function fakeRedis() {
    const keys = new Map<string, number>();
    return {
        keys,
        set: jest.fn(
            async (
                key: string,
                _value: string,
                _px: string,
                ms: number,
                _nx: string,
            ) => {
                const expiry = keys.get(key);
                if (expiry !== undefined && expiry > Date.now()) return null;
                keys.set(key, Date.now() + ms);
                return 'OK';
            },
        ),
        pttl: jest.fn(async (key: string) => {
            const expiry = keys.get(key);
            return expiry === undefined ? -2 : expiry - Date.now();
        }),
    };
}

describe('slow mode is claimed atomically', () => {
    it('lets the first message through and holds the next', async () => {
        const redis = fakeRedis();

        await expect(claim(redis, {}, 5000)).resolves.toBeUndefined();
        await expect(claim(redis, {}, 5000)).rejects.toBeInstanceOf(ApiError);
    });

    it('rejects a burst that used to slip through the read-then-write gap', async () => {
        const redis = fakeRedis();

        const results = await Promise.allSettled(
            Array.from({ length: 10 }, () => claim(redis, {}, 5000)),
        );

        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter((r) => r.status === 'rejected')).toHaveLength(9);
    });

    it('claims with NX and an expiry, in one round trip', async () => {
        const redis = fakeRedis();

        await claim(redis, {}, 4000);

        expect(redis.set).toHaveBeenCalledTimes(1);
        expect(redis.set).toHaveBeenCalledWith(
            `slowmode:${CHANNEL}:${USER}`,
            '1',
            'PX',
            4000,
            'NX',
        );
    });

    it('reports the remaining time from the key, not from a guess', async () => {
        const redis = fakeRedis();

        await claim(redis, {}, 60_000);
        await expect(claim(redis, {}, 60_000)).rejects.toThrow(/\d+s/);
        expect(redis.pttl).toHaveBeenCalled();
    });

    it('does nothing when the channel has no cooldown', async () => {
        const redis = fakeRedis();

        await claim(redis, {}, 0);

        expect(redis.set).not.toHaveBeenCalled();
    });

    it('falls back to the message history when Redis is unavailable', async () => {
        const redis = {
            set: jest.fn().mockRejectedValue(new Error('redis down')),
            pttl: jest.fn(),
        };
        const messageRepo = {
            findLastByChannelAndUser: jest.fn().mockResolvedValue({
                createdAt: new Date(Date.now() - 1000),
            }),
        };

        await expect(claim(redis, messageRepo, 5000)).rejects.toBeInstanceOf(
            ApiError,
        );
        expect(messageRepo.findLastByChannelAndUser).toHaveBeenCalled();
    });

    it('allows the send when the fallback shows the cooldown has passed', async () => {
        const redis = {
            set: jest.fn().mockRejectedValue(new Error('redis down')),
            pttl: jest.fn(),
        };
        const messageRepo = {
            findLastByChannelAndUser: jest.fn().mockResolvedValue({
                createdAt: new Date(Date.now() - 60_000),
            }),
        };

        await expect(claim(redis, messageRepo, 5000)).resolves.toBeUndefined();
    });

    it('does not swallow its own rejection into the fallback', async () => {
        const redis = fakeRedis();
        const messageRepo = {
            findLastByChannelAndUser: jest.fn(),
        };

        await claim(redis, messageRepo, 5000);
        await expect(claim(redis, messageRepo, 5000)).rejects.toBeInstanceOf(
            ApiError,
        );

        expect(messageRepo.findLastByChannelAndUser).not.toHaveBeenCalled();
    });
});
