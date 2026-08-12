import { WsDispatcher } from '../dispatcher';
import { WS_CONTROLLER_METADATA, WS_EVENT_METADATA } from '../decorators';
import { container } from '@/di/container';

const logger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
};
const redisService = { getClient: jest.fn(), getSubscriber: jest.fn() };

function makeDispatcher(): WsDispatcher {
    return new WsDispatcher(logger, redisService as never);
}

function fakeSocket(readyState: number) {
    const sent: string[] = [];
    return {
        sent,
        socket: {
            OPEN: 1,
            readyState,
            send: (data: string, cb?: (err?: Error) => void) => {
                sent.push(data);
                cb?.(undefined);
            },
        },
    };
}

function controllerClass(events: { type: string; method: string }[]) {
    class Ctrl {
        public async handler() {
            return { ok: true };
        }
    }
    Reflect.defineMetadata(WS_CONTROLLER_METADATA, true, Ctrl);
    Reflect.defineMetadata(WS_EVENT_METADATA, events, Ctrl);
    return Ctrl;
}

describe('WsDispatcher registration', () => {
    let getAll: jest.SpyInstance;
    let dispatcher: WsDispatcher;

    beforeEach(() => {
        jest.clearAllMocks();
        dispatcher = makeDispatcher();
        getAll = jest.spyOn(container, 'getAll');
    });

    afterEach(() => {
        getAll.mockRestore();
        dispatcher.destroy();
    });

    it('skips a class that never carried @WsController', () => {
        class Undecorated {
            public async handler() {
                return null;
            }
        }
        // No WS_CONTROLLER_METADATA at all: undefined, not false.
        Reflect.defineMetadata(
            WS_EVENT_METADATA,
            [{ type: 'sneaky_event', method: 'handler' }],
            Undecorated,
        );
        getAll.mockReturnValue([new Undecorated()]);

        dispatcher.registerControllers();

        expect(dispatcher.hasHandler('sneaky_event')).toBe(false);
    });

    it('registers a decorated controller', () => {
        const Ctrl = controllerClass([
            { type: 'known_event', method: 'handler' },
        ]);
        getAll.mockReturnValue([new Ctrl()]);

        dispatcher.registerControllers();

        expect(dispatcher.hasHandler('known_event')).toBe(true);
    });

    it('refuses to start when two controllers claim the same event', () => {
        const First = controllerClass([
            { type: 'typing_dm', method: 'handler' },
        ]);
        const Second = controllerClass([
            { type: 'typing_dm', method: 'handler' },
        ]);
        getAll.mockReturnValue([new First(), new Second()]);

        expect(() => dispatcher.registerControllers()).toThrow(
            /Duplicate handler for 'typing_dm'/,
        );
    });
});

describe('WsDispatcher sends', () => {
    let dispatcher: WsDispatcher;

    beforeEach(() => {
        dispatcher = makeDispatcher();
    });

    afterEach(() => {
        dispatcher.destroy();
    });

    const envelope = {
        id: 'req-1',
        event: { type: 'nope', payload: {} },
        meta: {},
    } as never;

    interface SendPaths {
        sendError: (
            ws: unknown,
            envelope: unknown,
            code: string,
            message: string,
        ) => void;
    }

    function sendPaths(target: unknown): SendPaths {
        return target as SendPaths;
    }

    function sendError(ws: unknown) {
        sendPaths(dispatcher).sendError(ws, envelope, 'UNAUTHORIZED', 'nope');
    }

    it('does not write to a socket that is not open', () => {
        const { sent, socket } = fakeSocket(3 /* CLOSED */);

        sendError(socket);

        expect(sent).toHaveLength(0);
    });

    it('keeps the envelope shape when the socket is open', () => {
        const { sent, socket } = fakeSocket(1 /* OPEN */);

        sendError(socket);

        expect(sent).toHaveLength(1);
        const parsed = JSON.parse(sent[0] as string);
        expect(parsed).toMatchObject({
            event: { type: 'error', payload: { code: 'UNAUTHORIZED' } },
            meta: { replyTo: 'req-1' },
        });
        expect(typeof parsed.id).toBe('string');
        expect(typeof parsed.meta.ts).toBe('number');
    });
});
