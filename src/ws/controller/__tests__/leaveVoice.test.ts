/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock('@/services/PushService', () => ({
    notifyUser: jest.fn().mockResolvedValue(undefined),
    notifyUsers: jest.fn().mockResolvedValue(undefined),
}));

import { ServerController } from '../ServerController';

const SERVER = '0254710804526399488';
const CHANNEL = '0254710804526399489';
const LEAVER = '0254710804526399490';
const JOINER = '0254710804526399491';

function fakeRedis() {
    const sets = new Map<string, Set<string>>();
    const hashes = new Map<string, Map<string, string>>();
    const calls: string[] = [];

    const dropIfEmpty = (key: string) => {
        if (sets.get(key)?.size === 0) sets.delete(key);
        if (hashes.get(key)?.size === 0) hashes.delete(key);
    };

    return {
        sets,
        hashes,
        calls,
        srem: jest.fn(async (key: string, member: string) => {
            calls.push(`srem ${key}`);
            const removed = sets.get(key)?.delete(member) === true ? 1 : 0;
            dropIfEmpty(key);
            return removed;
        }),
        hdel: jest.fn(async (key: string, field: string) => {
            calls.push(`hdel ${key}`);
            const removed = hashes.get(key)?.delete(field) === true ? 1 : 0;
            dropIfEmpty(key);
            return removed;
        }),
        del: jest.fn(async (key: string) => {
            calls.push(`del ${key}`);
            sets.delete(key);
            hashes.delete(key);
            return 1;
        }),
        scard: jest.fn(async (key: string) => {
            calls.push(`scard ${key}`);
            return sets.get(key)?.size ?? 0;
        }),
        hlen: jest.fn(async (key: string) => {
            calls.push(`hlen ${key}`);
            return hashes.get(key)?.size ?? 0;
        }),
        sadd: async (key: string, member: string) => {
            const set = sets.get(key) ?? new Set<string>();
            set.add(member);
            sets.set(key, set);
        },
        hset: async (key: string, field: string, value: string) => {
            const hash = hashes.get(key) ?? new Map<string, string>();
            hash.set(field, value);
            hashes.set(key, hash);
        },
    };
}

function controllerWith(redis: unknown) {
    const controller = Object.create(
        ServerController.prototype,
    ) as ServerController;
    (controller as any).redisService = { getClient: () => redis };
    (controller as any).wsServer = {
        broadcastToServerWithPermission: jest.fn().mockResolvedValue(undefined),
    };
    return controller;
}

const leave = (controller: ServerController) =>
    (
        controller as unknown as {
            _internalLeaveVoice: (
                userId: string,
                serverId: string,
                channelId: string,
            ) => Promise<void>;
        }
    )._internalLeaveVoice(LEAVER, SERVER, CHANNEL);

const VOICE_KEY = `voice_channel:${SERVER}:${CHANNEL}`;
const STATE_KEY = `voice_states:${SERVER}:${CHANNEL}`;

describe('leaving a voice channel', () => {
    it('does not destroy a concurrent join', async () => {
        const redis = fakeRedis();
        await redis.sadd(VOICE_KEY, LEAVER);
        await redis.hset(STATE_KEY, LEAVER, '{}');

        const leaving = leave(controllerWith(redis));
        await redis.sadd(VOICE_KEY, JOINER);
        await redis.hset(STATE_KEY, JOINER, '{}');
        await leaving;

        expect([...(redis.sets.get(VOICE_KEY) ?? [])]).toEqual([JOINER]);
        expect([...(redis.hashes.get(STATE_KEY)?.keys() ?? [])]).toEqual([
            JOINER,
        ]);
    });

    it('lets Redis drop the keys when the last member leaves', async () => {
        const redis = fakeRedis();
        await redis.sadd(VOICE_KEY, LEAVER);
        await redis.hset(STATE_KEY, LEAVER, '{}');

        await leave(controllerWith(redis));

        expect(redis.sets.has(VOICE_KEY)).toBe(false);
        expect(redis.hashes.has(STATE_KEY)).toBe(false);
    });

    it('never reads a count in order to decide on a delete', async () => {
        const redis = fakeRedis();
        await redis.sadd(VOICE_KEY, LEAVER);

        await leave(controllerWith(redis));

        expect(redis.scard).not.toHaveBeenCalled();
        expect(redis.hlen).not.toHaveBeenCalled();
    });

    it('touches only the server-scoped keys', async () => {
        const redis = fakeRedis();

        await leave(controllerWith(redis));

        expect(redis.calls.sort()).toEqual([
            `del user_voice:${LEAVER}`,
            `hdel ${STATE_KEY}`,
            `srem ${VOICE_KEY}`,
        ]);
        for (const call of redis.calls) {
            expect(call).not.toContain(`voice_channel:${CHANNEL}`);
            expect(call).not.toContain(`voice_states:${CHANNEL}`);
        }
    });

    it('costs three Redis commands, not ten', async () => {
        const redis = fakeRedis();

        await leave(controllerWith(redis));

        expect(redis.calls).toHaveLength(3);
    });
});
