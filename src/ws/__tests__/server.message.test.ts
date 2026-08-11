import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { WebSocket as WsClient } from 'ws';
import { WsServer } from '../server';
import { wsMsgTotalCounter } from '@/utils/metrics';

const KNOWN_EVENTS = new Set(['authenticate', 'ping']);

const subscriber = {
    subscribe: jest.fn(),
    on: jest.fn(),
    unsubscribe: jest.fn().mockResolvedValue(undefined),
};

const dispatcher = {
    registerControllers: jest.fn(),
    registerConnection: jest.fn(),
    cleanup: jest.fn(),
    destroy: jest.fn(),
    dispatch: jest.fn().mockResolvedValue(undefined),
    hasHandler: jest.fn((type: string) => KNOWN_EVENTS.has(type)),
};

const redisService = { getSubscriber: () => subscriber };

interface AuthTimerInternals {
    armAuthTimeout: (ws: WsClient, timeoutMs: number) => void;
}

/** The re-arm cap has no public surface; the spy is the only cheap probe. */
function internals(target: unknown): AuthTimerInternals {
    return target as AuthTimerInternals;
}

function frame(type: string) {
    return JSON.stringify({
        id: 'envelope-1',
        event: { type, payload: {} },
        meta: {},
    });
}

async function countsByType(): Promise<Record<string, number>> {
    const metric = await wsMsgTotalCounter.get();
    const out: Record<string, number> = {};
    for (const value of metric.values) {
        const label = String(value.labels.type);
        out[label] = (out[label] ?? 0) + value.value;
    }
    return out;
}

describe('WsServer message handling', () => {
    let server: Server;
    let wsServer: WsServer;
    let port: number;
    let armAuthTimeout: jest.SpyInstance;

    beforeAll(async () => {
        server = createServer();
        wsServer = new WsServer(
            dispatcher as never,
            redisService as never,
            {} as never,
        );
        armAuthTimeout = jest.spyOn(internals(wsServer), 'armAuthTimeout');
        wsServer.initialize(server);

        await new Promise<void>((resolve) => {
            server.listen(0, '127.0.0.1', resolve);
        });
        port = (server.address() as AddressInfo).port;
    });

    afterAll(async () => {
        armAuthTimeout.mockRestore();
        await wsServer.shutdown();
        await new Promise<void>((resolve) => {
            server.close(() => resolve());
        });
    });

    async function connect(): Promise<WsClient> {
        const client = new WsClient(`ws://127.0.0.1:${port}/ws`);
        await new Promise<void>((resolve, reject) => {
            client.on('open', () => resolve());
            client.on('error', reject);
        });
        return client;
    }

    async function drain(client: WsClient): Promise<void> {
        await new Promise<void>((resolve) => {
            client.ping();
            client.once('pong', () => resolve());
        });
    }

    it('labels unregistered event names as unknown', async () => {
        wsMsgTotalCounter.reset();
        const client = await connect();

        for (let i = 0; i < 20; i++) {
            client.send(frame(`attack_${i}`));
        }
        client.send(frame('ping'));
        await drain(client);

        const counts = await countsByType();
        expect(counts.unknown).toBe(20);
        expect(counts.ping).toBe(1);
        expect(
            Object.keys(counts).filter((k) => k.startsWith('attack_')),
        ).toHaveLength(0);

        client.close();
    }, 15000);

    it('stops re-arming the auth timer after three attempts', async () => {
        const client = await connect();
        armAuthTimeout.mockClear();

        for (let i = 0; i < 10; i++) {
            client.send(frame('authenticate'));
        }
        await drain(client);

        expect(armAuthTimeout).toHaveBeenCalledTimes(3);

        client.close();
    }, 15000);

    it('counts attempts per socket, not globally', async () => {
        const first = await connect();
        const second = await connect();
        armAuthTimeout.mockClear();

        for (let i = 0; i < 5; i++) {
            first.send(frame('authenticate'));
        }
        second.send(frame('authenticate'));
        await drain(first);
        await drain(second);

        // 3 from the capped socket, 1 from the fresh one.
        expect(armAuthTimeout).toHaveBeenCalledTimes(4);

        first.close();
        second.close();
    }, 15000);
});
