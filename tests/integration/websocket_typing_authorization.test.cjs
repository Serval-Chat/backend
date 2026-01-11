/**
 * WebSocket Typing Authorization Tests
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { setup, teardown } = require('./setup.cjs');
const { createTestUser, generateAuthToken, clearDatabase } = require('./helpers.cjs');
const { createAuthenticatedClient, sendEvent, waitForEvent, ensureEventNotReceived } = require('./websocket_helpers.cjs');

describe('WebSocket Typing Authorization Tests', { timeout: 30000 }, function () {
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

    it('should NOT allow typing indicators to non-friends', async function () {
        const userA = await createTestUser({ username: 'UserA' });
        const userB = await createTestUser({ username: 'UserB' });
        const tokenA = generateAuthToken(userA);
        const tokenB = generateAuthToken(userB);

        const wsA = await createAuthenticatedClient(appServer, tokenA);
        const wsB = await createAuthenticatedClient(appServer, tokenB);

        // UserA tries to send typing indicator to UserB (not friends)
        sendEvent(wsA, 'typing_dm', {
            receiverId: userB._id.toString()
        });

        // UserB should NOT receive the typing event
        await ensureEventNotReceived(wsB, 'typing_dm', 2000);

        wsA.close();
        wsB.close();
    });

    it('should allow typing indicators between friends', async function () {
        const userA = await createTestUser({ username: 'UserA' });
        const userB = await createTestUser({ username: 'UserB' });

        // Make them friends
        const { Friendship } = require('../../src/models/Friendship');
        await Friendship.create({ userId: userA._id, friendId: userB._id, user: 'UserA', friend: 'UserB' });
        await Friendship.create({ userId: userB._id, friendId: userA._id, user: 'UserB', friend: 'UserA' });

        const tokenA = generateAuthToken(userA);
        const tokenB = generateAuthToken(userB);

        const wsA = await createAuthenticatedClient(appServer, tokenA);
        const wsB = await createAuthenticatedClient(appServer, tokenB);

        const promiseTyping = waitForEvent(wsB, 'typing_dm', 5000);

        sendEvent(wsA, 'typing_dm', {
            receiverId: userB._id.toString()
        });

        const event = await promiseTyping;
        assert.strictEqual(event.senderId, userA._id.toString());

        wsA.close();
        wsB.close();
    });
});
