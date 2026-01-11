/**
 * WebSocket Integration Tests: Transport, Auth, Heartbeat
 */

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const {
    setup,
    teardown,
    getServer
} = require('./setup.cjs');
const {
    createTestUser,
    generateAuthToken,
    clearDatabase
} = require('./helpers.cjs');
const {
    createAuthenticatedClient,
    sendEvent,
    waitForEvent
} = require('./websocket_helpers.cjs');
const crypto = require('node:crypto');

describe('WebSocket Core Tests', { timeout: 30000 }, function () {
    let appServer;

    before(async function () {
        const setupData = await setup();
        appServer = setupData.server;
    });

    after(async function () {
        await teardown();
    });

    beforeEach(async function () {
        await clearDatabase();
    });

    describe('Transport & Handshake', function () {
        it('should successfully upgrade to WebSocket protocol', async function () {
            const address = appServer.address();
            const port = address.port;
            const wsUrl = `ws://localhost:${port}/ws`;

            const ws = new WebSocket(wsUrl);

            await new Promise((resolve, reject) => {
                ws.on('open', () => {
                    assert.strictEqual(ws.readyState, WebSocket.OPEN);
                    ws.close();
                    resolve();
                });
                ws.on('error', reject);
            });
        });
    });

    describe('Authentication', function () {
        it('should authenticate successfully with a valid token', async function () {
            const user = await createTestUser();
            const token = generateAuthToken(user);

            const ws = await createAuthenticatedClient(appServer, token);
            assert.strictEqual(ws.readyState, WebSocket.OPEN);
            ws.close();
        });

        it('should fail authentication with an invalid token', async function () {
            const address = appServer.address();
            const port = address.port;
            const wsUrl = `ws://localhost:${port}/ws`;
            const ws = new WebSocket(wsUrl);

            await new Promise((resolve, reject) => {
                ws.on('open', () => {
                    const authEnvelope = {
                        id: crypto.randomUUID(),
                        event: {
                            type: 'authenticate',
                            payload: { token: 'invalid-token' }
                        }
                    };
                    ws.send(JSON.stringify(authEnvelope));
                });

                ws.on('message', (data) => {
                    const envelope = JSON.parse(data.toString());
                    if (envelope.event && envelope.event.type === 'error') {
                        assert.strictEqual(envelope.event.payload.code, 'UNAUTHORIZED');
                        ws.close();
                        resolve();
                    }
                });

                ws.on('close', () => resolve());
                ws.on('error', reject);
            });
        });

        it('should disconnect if not authenticated within timeout', { timeout: 15000 }, async function () {
            const address = appServer.address();
            const port = address.port;
            const wsUrl = `ws://localhost:${port}/ws`;
            const ws = new WebSocket(wsUrl);

            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('WebSocket did not close within expected timeout'));
                }, 12000);

                ws.on('close', () => {
                    clearTimeout(timeout);
                    resolve();
                });
            });
        });
    });

    describe('Heartbeat (Ping/Pong)', function () {
        it('should respond with pong to a ping', async function () {
            const user = await createTestUser();
            const token = generateAuthToken(user);
            const ws = await createAuthenticatedClient(appServer, token);

            const requestId = crypto.randomUUID();
            const promise = waitForEvent(ws, 'pong', 5000);

            sendEvent(ws, 'ping', {}, undefined);

            const payload = await promise;
            assert.ok(payload);
            ws.close();
        });
    });

    describe('Multi-session Support', function () {
        it('should broadcast events to all sessions of a user', async function () {
            const userA = await createTestUser({ username: 'UserA' });
            const userB = await createTestUser({ username: 'UserB' });
            const tokenA = generateAuthToken(userA);
            const tokenB = generateAuthToken(userB);

            // Two sessions for User B
            const wsB1 = await createAuthenticatedClient(appServer, tokenB);
            const wsB2 = await createAuthenticatedClient(appServer, tokenB);

            // User A session
            const wsA = await createAuthenticatedClient(appServer, tokenA);

            // Ensure Friendship for DM
            const { Friendship } = require('../../src/models/Friendship');
            await Friendship.create({
                userId: userA._id,
                friendId: userB._id,
                user: userA.username,
                friend: userB.username
            });

            const text = 'Hello sessions!';
            const promiseB1 = waitForEvent(wsB1, 'message_dm', 5000);
            const promiseB2 = waitForEvent(wsB2, 'message_dm', 5000);

            sendEvent(wsA, 'send_message_dm', {
                receiverId: userB._id.toString(),
                text: text
            });

            const msgB1 = await promiseB1;
            const msgB2 = await promiseB2;

            assert.strictEqual(msgB1.text, text);
            assert.strictEqual(msgB2.text, text);

            wsB1.close();
            wsB2.close();
            wsA.close();
        });
    });
});
