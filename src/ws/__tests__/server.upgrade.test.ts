import { createServer, type Server } from 'node:http';
import { connect, type AddressInfo } from 'node:net';
import { WebSocket as WsClient } from 'ws';
import { WsServer } from '../server';

const REJECT_TIMEOUT_MS = 3000;

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
};

const redisService = {
    getSubscriber: () => subscriber,
};

interface UpgradeAttempt {
    response: string;
    closedByServer: boolean;
}

function attemptUpgrade(port: number, path: string): Promise<UpgradeAttempt> {
    return new Promise((resolve, reject) => {
        const socket = connect(port, '127.0.0.1');
        let response = '';

        const timer = setTimeout(() => {
            socket.destroy();
            reject(
                new Error(
                    `upgrade to ${path} left the socket open for ${REJECT_TIMEOUT_MS}ms`,
                ),
            );
        }, REJECT_TIMEOUT_MS);

        socket.setEncoding('utf8');
        socket.on('data', (chunk: string) => {
            response += chunk;
        });
        socket.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
        socket.on('close', () => {
            clearTimeout(timer);
            resolve({ response, closedByServer: true });
        });

        socket.write(
            `GET ${path} HTTP/1.1\r\n` +
                `Host: 127.0.0.1:${port}\r\n` +
                'Upgrade: websocket\r\n' +
                'Connection: Upgrade\r\n' +
                'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
                'Sec-WebSocket-Version: 13\r\n\r\n',
        );
    });
}

describe('WsServer upgrade handling', () => {
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

    it.each(['/', '/nope', '/ws/extra', '/ws/', '/WS'])(
        'closes the socket for an upgrade to %s',
        async (path) => {
            const { response, closedByServer } = await attemptUpgrade(
                port,
                path,
            );

            expect(closedByServer).toBe(true);
            expect(response).toMatch(/^HTTP\/1\.1 400 Bad Request\r\n/);
        },
        10000,
    );

    it('does not hand a rejected upgrade to the WebSocket server', async () => {
        dispatcher.registerConnection.mockClear();

        await attemptUpgrade(port, '/nope');

        expect(dispatcher.registerConnection).not.toHaveBeenCalled();
    }, 10000);

    it('still accepts a genuine upgrade to /ws', async () => {
        const client = new WsClient(`ws://127.0.0.1:${port}/ws`);

        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error('/ws did not connect')),
                REJECT_TIMEOUT_MS,
            );
            client.on('open', () => {
                clearTimeout(timer);
                resolve();
            });
            client.on('error', (err) => {
                clearTimeout(timer);
                reject(err);
            });
        });

        expect(client.readyState).toBe(WsClient.OPEN);
        expect(dispatcher.registerConnection).toHaveBeenCalledTimes(1);

        await new Promise<void>((resolve) => {
            client.on('close', () => resolve());
            client.close();
        });
    }, 10000);
});
