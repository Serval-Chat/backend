import { createServer, type Server } from 'node:http';
import { connect, type AddressInfo } from 'node:net';

import { WsServer } from '../server';

const dispatcher = {
    registerControllers: jest.fn(),
    registerConnection: jest.fn(),
    cleanup: jest.fn(),
    destroy: jest.fn(),
};

const counters = new Map<string, number>();
const client = {
    incr: jest.fn(async (key: string) => {
        const next = (counters.get(key) ?? 0) + 1;
        counters.set(key, next);
        return next;
    }),
    pexpire: jest.fn().mockResolvedValue(1),
};

const redisService = {
    getSubscriber: () => ({
        subscribe: jest.fn(),
        on: jest.fn(),
        unsubscribe: jest.fn().mockResolvedValue(undefined),
    }),
    getClient: () => client,
};

function attemptUpgrade(port: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const socket = connect(port, '127.0.0.1');
        let response = '';
        const timer = setTimeout(() => {
            socket.destroy();
            resolve(response);
        }, 2000);

        socket.setEncoding('utf8');
        socket.on('data', (chunk: string) => {
            response += chunk;
            if (response.includes('\r\n\r\n')) {
                clearTimeout(timer);
                socket.destroy();
                resolve(response);
            }
        });
        socket.on('error', reject);
        socket.on('close', () => {
            clearTimeout(timer);
            resolve(response);
        });

        socket.write(
            'GET /ws HTTP/1.1\r\n' +
                `Host: 127.0.0.1:${port}\r\n` +
                'Upgrade: websocket\r\n' +
                'Connection: Upgrade\r\n' +
                'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
                'Sec-WebSocket-Version: 13\r\n\r\n',
        );
    });
}

describe('per-source handshake limit', () => {
    let server: Server;
    let wsServer: WsServer;
    let port: number;

    beforeAll(async () => {
        server = createServer();
        wsServer = new WsServer(
            dispatcher as never,
            redisService as never,
            {} as never,
        );
        wsServer.initialize(server);
        await new Promise<void>((resolve) => {
            server.listen(0, '127.0.0.1', resolve);
        });
        port = (server.address() as AddressInfo).port;
    });

    afterAll(async () => {
        await wsServer.shutdown();
        await new Promise<void>((resolve) => {
            server.close(() => resolve());
        });
    });

    beforeEach(() => {
        counters.clear();
        jest.clearAllMocks();
    });

    it('accepts a handshake under the limit', async () => {
        const response = await attemptUpgrade(port);
        expect(response).toMatch(/^HTTP\/1\.1 101 /);
    }, 10000);

    it('refuses with 429 once the source exceeds its budget', async () => {
        counters.set('ws:handshake:127.0.0.1', 30);

        const response = await attemptUpgrade(port);

        expect(response).toMatch(/^HTTP\/1\.1 429 Too Many Requests\r\n/);
        expect(response).toContain('Retry-After: 60');
    }, 10000);

    it('counts each source separately', async () => {
        counters.set('ws:handshake:198.51.100.7', 999);

        const response = await attemptUpgrade(port);

        expect(response).toMatch(/^HTTP\/1\.1 101 /);
    }, 10000);

    it('sets the window only on the first handshake of a source', async () => {
        await attemptUpgrade(port);
        expect(client.pexpire).toHaveBeenCalledTimes(1);

        await attemptUpgrade(port);
        expect(client.pexpire).toHaveBeenCalledTimes(1);
    }, 10000);

    it('lets connections through when Redis is unavailable', async () => {
        client.incr.mockRejectedValueOnce(new Error('redis down'));

        const response = await attemptUpgrade(port);

        expect(response).toMatch(/^HTTP\/1\.1 101 /);
    }, 10000);
});
