/**
 * WebSocket Security & Abuse Integration Tests
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
    setup,
    teardown
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

describe('WebSocket Security Tests', { timeout: 30000 }, function () {
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

    it('should trigger rate limiting on rapid messages', async function () {
        const user = await createTestUser();
        const token = generateAuthToken(user);

        const ws = await createAuthenticatedClient(appServer, token);

        const promiseError = waitForEvent(ws, 'error', 10000);

        // Let's create a friend so we can send messages
        const friend = await createTestUser();
        const { Friendship } = require('../../src/models/Friendship');
        await Friendship.create({ userId: user._id, friendId: friend._id, user: user.username, friend: friend.username });
        await Friendship.create({ userId: friend._id, friendId: user._id, user: friend.username, friend: user.username });

        for (let i = 0; i < 15; i++) {
            sendEvent(ws, 'send_message_dm', {
                receiverId: friend._id.toString(),
                text: `Spam ${i}`
            });
        }

        const error = await promiseError;
        assert.strictEqual(error.code, 'RATE_LIMIT');
        assert.match(error.details.message, /Rate limit exceeded/);

        ws.close();
    });

    it('should handle excessively large payloads by disconnecting or returning error', async function () {
        const user = await createTestUser();
        const token = generateAuthToken(user);
        const ws = await createAuthenticatedClient(appServer, token);

        const largeText = 'A'.repeat(2 * 1024 * 1024); // 2MB

        let closed = false;
        ws.on('close', () => { closed = true; });


        sendEvent(ws, 'ping', { data: largeText });


        await new Promise(r => setTimeout(r, 1000));

        assert.ok(closed, 'Connection should be closed due to large payload');
    });
});
