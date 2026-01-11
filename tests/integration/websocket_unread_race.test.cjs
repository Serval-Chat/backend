/**
 * WebSocket Unread Count Race Condition Tests
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { setup, teardown } = require('./setup.cjs');
const { createTestUser, generateAuthToken, clearDatabase } = require('./helpers.cjs');
const { createAuthenticatedClient, sendEvent } = require('./websocket_helpers.cjs');

describe('WebSocket Unread Race Condition Tests', { timeout: 30000 }, function () {
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

    it('should handle concurrent messages with correct unread counts', async function () {
        const userA = await createTestUser({ username: 'UserA' });
        const userB = await createTestUser({ username: 'UserB' });

        const { Friendship } = require('../../src/models/Friendship');
        await Friendship.create({ userId: userA._id, friendId: userB._id, user: 'UserA', friend: 'UserB' });
        await Friendship.create({ userId: userB._id, friendId: userA._id, user: 'UserB', friend: 'UserA' });

        const tokenA = generateAuthToken(userA);
        const tokenB = generateAuthToken(userB);

        const wsA = await createAuthenticatedClient(appServer, tokenA);
        const wsB = await createAuthenticatedClient(appServer, tokenB);

        const unreadEvents = [];
        wsB.on('message', (data) => {
            const parsed = JSON.parse(data.toString());
            if (parsed.event && parsed.event.type === 'dm_unread_updated') {
                unreadEvents.push(parsed.event.payload);
            }
        });

        console.log('Sending 5 messages...');
        for (let i = 0; i < 5; i++) {
            sendEvent(wsA, 'send_message_dm', {
                receiverId: userB._id.toString(),
                text: `Message ${i + 1}`
            });
        }
        console.log('Messages sent, waiting...');

        // Wait for all unread events
        await new Promise(r => setTimeout(r, 2000));

        // Verify we got 5 unread events with counts 1, 2, 3, 4, 5
        assert.strictEqual(unreadEvents.length, 5);
        const counts = unreadEvents.map(e => e.count).sort((a, b) => a - b);
        assert.deepStrictEqual(counts, [1, 2, 3, 4, 5]);

        wsA.close();
        wsB.close();
    });
});
