import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WebSocket } from 'ws';

import { DEFAULT_HANDLER_TIMEOUT_MS, WsDispatcher } from '../dispatcher';

const CONTROLLER_DIR = join(__dirname, '..', 'controller');

function dispatcher() {
    return new WsDispatcher(
        {
            error: jest.fn(),
            warn: jest.fn(),
            info: jest.fn(),
            debug: jest.fn(),
        },
        { getClient: () => ({}) } as never,
    );
}

function run(instance: object, method: string) {
    return (
        dispatcher() as unknown as {
            executeHandler: (
                instance: object,
                method: string,
                envelope: unknown,
                user?: unknown,
                ws?: WebSocket,
            ) => Promise<unknown>;
        }
    ).executeHandler(instance, method, {
        id: 'req-1',
        event: { type: 'x', payload: {} },
        meta: { ts: 0 },
    });
}

describe('every handler runs under a deadline', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('is generous enough for real work and short enough to shed a hang', () => {
        expect(DEFAULT_HANDLER_TIMEOUT_MS).toBe(10_000);
        expect(DEFAULT_HANDLER_TIMEOUT_MS).toBeGreaterThan(5_000);
    });

    it('times out a handler that declares no @Timeout', async () => {
        class Controller {
            public async hang(): Promise<never> {
                return new Promise<never>(() => undefined);
            }
        }

        const pending = run(new Controller(), 'hang');
        const assertion = expect(pending).rejects.toThrow('TIMEOUT');

        await jest.advanceTimersByTimeAsync(DEFAULT_HANDLER_TIMEOUT_MS + 1);
        await assertion;
    });

    it('aborts the signal it handed the handler', async () => {
        let seen: AbortSignal | undefined;
        class Controller {
            public async hang(
                _payload: unknown,
                _user: unknown,
                _ws: unknown,
                signal: AbortSignal,
            ): Promise<never> {
                seen = signal;
                return new Promise<never>(() => undefined);
            }
        }

        const pending = run(new Controller(), 'hang');
        const assertion = expect(pending).rejects.toThrow('TIMEOUT');

        expect(seen?.aborted).toBe(false);
        await jest.advanceTimersByTimeAsync(DEFAULT_HANDLER_TIMEOUT_MS + 1);
        await assertion;
        expect(seen?.aborted).toBe(true);
    });

    it('returns normally well inside the deadline', async () => {
        class Controller {
            public async quick(): Promise<string> {
                return 'done';
            }
        }

        await expect(run(new Controller(), 'quick')).resolves.toBe('done');
    });
});

describe('acknowledgement coverage', () => {
    const sources = readdirSync(CONTROLLER_DIR)
        .filter((f) => f.endsWith('Controller.ts'))
        .map((f) => readFileSync(join(CONTROLLER_DIR, f), 'utf8'))
        .join('\n');

    function returnTypeOf(event: string): string {
        const lines = sources.split('\n');
        const at = lines.findIndex((l) => l.includes(`@Event('${event}')`));
        expect(at).toBeGreaterThan(-1);
        for (let i = at; i < at + 40; i++) {
            const m = /\): (Promise<.*?>|void)\s*\{/.exec(lines[i] ?? '');
            if (m) return m[1] as string;
        }
        return 'unknown';
    }

    it.each(['leave_server', 'leave_channel'])(
        '%s acknowledges, so a client can await it',
        (event) => {
            expect(returnTypeOf(event)).not.toContain('void');
        },
    );

    it.each(['typing_dm', 'typing_server'])(
        '%s stays fire-and-forget',
        (event) => {
            expect(returnTypeOf(event)).toContain('void');
        },
    );

    it('leaves exactly two commands silent', () => {
        const events = [...sources.matchAll(/@Event\('(\w+)'\)/g)].map(
            (m) => m[1] as string,
        );
        const silent = events.filter((e) => returnTypeOf(e).includes('void'));

        expect(silent.sort()).toEqual(['typing_dm', 'typing_server']);
    });
});
