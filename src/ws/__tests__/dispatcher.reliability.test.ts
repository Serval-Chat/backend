import { WsDispatcher } from '../dispatcher';
import { WS_TIMEOUT_METADATA } from '../decorators';

const logger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
};

interface Internals {
    rateLimitCache: Map<string, { points: number; resetAt: number }>;
    responseCache: Map<string, { value: unknown; expiresAt: number }>;
    cleanupExpiredCaches: () => void;
    checkRateLimit: (
        key: string,
        maxPoints: number,
        durationMs: number,
    ) => Promise<boolean>;
    executeHandler: (
        instance: unknown,
        method: string,
        envelope: unknown,
        user?: unknown,
        ws?: unknown,
    ) => Promise<unknown>;
}

function internals(dispatcher: unknown): Internals {
    return dispatcher as Internals;
}

describe('rate-limit fallback cache', () => {
    let dispatcher: WsDispatcher;
    const redisService = {
        getClient: () => ({
            incr: () => Promise.reject(new Error('redis unavailable')),
            pexpire: () => Promise.resolve(1),
        }),
        getSubscriber: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        dispatcher = new WsDispatcher(logger, redisService as never);
    });

    afterEach(() => {
        dispatcher.destroy();
    });

    it('prunes entries the cleanup pass reports on', async () => {
        const inner = internals(dispatcher);

        for (let i = 0; i < 50; i++) {
            await inner.checkRateLimit(`socket-${i}:some_event`, 10, 1000);
        }
        expect(inner.rateLimitCache.size).toBe(50);

        for (const entry of inner.rateLimitCache.values()) {
            entry.resetAt = Date.now() - 1;
        }
        inner.cleanupExpiredCaches();

        expect(inner.rateLimitCache.size).toBe(0);
    });

    it('keeps entries whose window is still open', async () => {
        const inner = internals(dispatcher);

        await inner.checkRateLimit('socket-live:some_event', 10, 60_000);
        inner.cleanupExpiredCaches();

        expect(inner.rateLimitCache.size).toBe(1);
    });

    it('still prunes the response cache', () => {
        const inner = internals(dispatcher);
        inner.responseCache.set('stale', {
            value: 1,
            expiresAt: Date.now() - 1,
        });
        inner.responseCache.set('fresh', {
            value: 1,
            expiresAt: Date.now() + 60_000,
        });

        inner.cleanupExpiredCaches();

        expect([...inner.responseCache.keys()]).toEqual(['fresh']);
    });
});

describe('handler timeout race', () => {
    let dispatcher: WsDispatcher;
    let unhandled: unknown[];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);

    beforeEach(() => {
        unhandled = [];
        process.on('unhandledRejection', onUnhandled);
        dispatcher = new WsDispatcher(logger, {
            getClient: jest.fn(),
            getSubscriber: jest.fn(),
        } as never);
    });

    afterEach(() => {
        process.off('unhandledRejection', onUnhandled);
        dispatcher.destroy();
    });

    it('does not leave the losing handler rejection unhandled', async () => {
        class Slow {
            public slow() {
                return new Promise((_resolve, reject) => {
                    setTimeout(
                        () => reject(new Error('aborted mid-flight')),
                        40,
                    );
                });
            }
        }
        Reflect.defineMetadata(WS_TIMEOUT_METADATA, 10, Slow.prototype, 'slow');
        const instance = new Slow();

        await expect(
            internals(dispatcher).executeHandler(
                instance,
                'slow',
                { id: 'r', event: { type: 't', payload: {} }, meta: {} },
                undefined,
                {},
            ),
        ).rejects.toThrow('TIMEOUT');

        await new Promise((resolve) => setTimeout(resolve, 120));

        expect(unhandled).toEqual([]);
    });

    it('still returns the handler result when it beats the timeout', async () => {
        class Fast {
            public fast() {
                return Promise.resolve({ ok: true });
            }
        }
        Reflect.defineMetadata(
            WS_TIMEOUT_METADATA,
            1000,
            Fast.prototype,
            'fast',
        );
        const instance = new Fast();

        await expect(
            internals(dispatcher).executeHandler(
                instance,
                'fast',
                { id: 'r', event: { type: 't', payload: {} }, meta: {} },
                undefined,
                {},
            ),
        ).resolves.toEqual({ ok: true });
    });

    it('still propagates a handler rejection that beats the timeout', async () => {
        class Failing {
            public failing() {
                return Promise.reject(new Error('handler blew up'));
            }
        }
        Reflect.defineMetadata(
            WS_TIMEOUT_METADATA,
            1000,
            Failing.prototype,
            'failing',
        );
        const instance = new Failing();

        await expect(
            internals(dispatcher).executeHandler(
                instance,
                'failing',
                { id: 'r', event: { type: 't', payload: {} }, meta: {} },
                undefined,
                {},
            ),
        ).rejects.toThrow('handler blew up');
    });
});
