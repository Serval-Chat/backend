const { setup, teardown } = require('./setup.cjs');
const WebSocket = require('ws');
const assert = require('assert');
const { test, before, after } = require('node:test');
const { WsServer } = require('../../src/ws/server');
const { WsSender } = require('../../src/ws/sender');
const { DebugService } = require('../../src/ws/services/DebugService');

test('WebSocket Sending', async (t) => {
    let testData;
    let wsServer;
    let wsSender;

    before(async () => {
        testData = await setup();
        wsServer = new WsServer(testData.server);
        wsSender = new WsSender();
        wsServer.registerController(new DebugService(wsSender));
    });

    after(async () => {
        await teardown();
    });

    await t.test('should receive DEBUG_PONG when sending DEBUG_PING', async () => {
        const server = testData.server;
        const address = server.address();
        const wsUrl = `ws://localhost:${address.port}/ws`;

        const ws = new WebSocket(wsUrl);

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                ws.close();
                reject(new Error('Test timed out'));
            }, 5000);

            ws.on('open', () => {
                const pingFrame = {
                    type: 1, // EVENT
                    event: 70, // DEBUG_PING
                    payload: { text: 'hello' }
                };
                ws.send(JSON.stringify(pingFrame));
            });

            ws.on('message', (data) => {
                const frame = JSON.parse(data.toString());
                if (frame.event === 71) { // DEBUG_PONG
                    assert.strictEqual(frame.payload.message, 'Pong from server');
                    clearTimeout(timeout);
                    ws.close();
                    resolve();
                }
            });

            ws.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
    });
});
