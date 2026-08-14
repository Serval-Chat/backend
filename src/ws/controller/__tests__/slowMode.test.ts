/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock('@/services/PushService', () => ({
    notifyUser: jest.fn().mockResolvedValue(undefined),
    notifyUsers: jest.fn().mockResolvedValue(undefined),
}));

import { ServerController } from '../ServerController';
import { ApiError } from '@/utils/ApiError';

const CHANNEL = '0254710804526399488';
const USER = '0254710804526399489';

function controllerWith(redis: unknown, serverMessageRepo: unknown) {
    const controller = Object.create(
        ServerController.prototype,
    ) as ServerController;
    (controller as any).redisService = { getClient: () => redis };
    (controller as any).serverMessageRepo = serverMessageRepo;
    return controller;
}

const claim = (controller: ServerController, cooldownMs: number) =>
    (
        controller as unknown as {
            assertSlowModeAllows: (
                channelId: string,
                userId: string,
                cooldownMs: number,
            ) => Promise<void>;
        }
    ).assertSlowModeAllows(CHANNEL, USER, cooldownMs);

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
        const controller = controllerWith(redis, {});

        await expect(claim(controller, 5000)).resolves.toBeUndefined();
        await expect(claim(controller, 5000)).rejects.toBeInstanceOf(ApiError);
    });

    it('rejects a burst that used to slip through the read-then-write gap', async () => {
        const redis = fakeRedis();
        const controller = controllerWith(redis, {});

        const results = await Promise.allSettled(
            Array.from({ length: 10 }, () => claim(controller, 5000)),
        );

        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter((r) => r.status === 'rejected')).toHaveLength(9);
    });

    it('claims with NX and an expiry, in one round trip', async () => {
        const redis = fakeRedis();
        const controller = controllerWith(redis, {});

        await claim(controller, 4000);

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
        const controller = controllerWith(redis, {});

        await claim(controller, 60_000);
        await expect(claim(controller, 60_000)).rejects.toThrow(/\d+s/);
        expect(redis.pttl).toHaveBeenCalled();
    });

    it('does nothing when the channel has no cooldown', async () => {
        const redis = fakeRedis();
        const controller = controllerWith(redis, {});

        await claim(controller, 0);

        expect(redis.set).not.toHaveBeenCalled();
    });

    it('falls back to the message history when Redis is unavailable', async () => {
        const redis = {
            set: jest.fn().mockRejectedValue(new Error('redis down')),
            pttl: jest.fn(),
        };
        const serverMessageRepo = {
            findLastByChannelAndUser: jest.fn().mockResolvedValue({
                createdAt: new Date(Date.now() - 1000),
            }),
        };
        const controller = controllerWith(redis, serverMessageRepo);

        await expect(claim(controller, 5000)).rejects.toBeInstanceOf(ApiError);
        expect(serverMessageRepo.findLastByChannelAndUser).toHaveBeenCalled();
    });

    it('allows the send when the fallback shows the cooldown has passed', async () => {
        const redis = {
            set: jest.fn().mockRejectedValue(new Error('redis down')),
            pttl: jest.fn(),
        };
        const serverMessageRepo = {
            findLastByChannelAndUser: jest.fn().mockResolvedValue({
                createdAt: new Date(Date.now() - 60_000),
            }),
        };
        const controller = controllerWith(redis, serverMessageRepo);

        await expect(claim(controller, 5000)).resolves.toBeUndefined();
    });

    it('does not swallow its own rejection into the fallback', async () => {
        const redis = fakeRedis();
        const serverMessageRepo = {
            findLastByChannelAndUser: jest.fn(),
        };
        const controller = controllerWith(redis, serverMessageRepo);

        await claim(controller, 5000);
        await expect(claim(controller, 5000)).rejects.toBeInstanceOf(ApiError);

        expect(
            serverMessageRepo.findLastByChannelAndUser,
        ).not.toHaveBeenCalled();
    });
});
