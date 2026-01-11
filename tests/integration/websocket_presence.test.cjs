/**
 * WebSocket Presence & Status Integration Tests
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
    waitForEvent,
    ensureEventNotReceived
} = require('./websocket_helpers.cjs');

describe('WebSocket Presence Tests', { timeout: 30000 }, function () {
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

    it('should receive presence_sync immediately after authentication', async function () {
        const userA = await createTestUser({ username: 'UserA' });
        const userB = await createTestUser({ username: 'UserB' });

        // Make them friends
        const { Friendship } = require('../../src/models/Friendship');
        await Friendship.create({
            userId: userA._id,
            friendId: userB._id,
            user: userA.username,
            friend: userB.username
        });

        // User B connects first
        const tokenB = generateAuthToken(userB);
        const wsB = await createAuthenticatedClient(appServer, tokenB);

        // User A connects
        const tokenA = generateAuthToken(userA);
        const wsA = await createAuthenticatedClient(appServer, tokenA);

        // User A should receive presence_sync listing User B as online
        const syncPayload = await waitForEvent(wsA, 'presence_sync', 5000);

        assert.ok(syncPayload.online);
        const onlineFriend = syncPayload.online.find(f => f.userId === userB._id.toString());
        assert.ok(onlineFriend, 'User B should be in the presence sync list');

        wsA.close();
        wsB.close();
    });

    it('should notify friends when a user comes online/offline', async function () {
        const userA = await createTestUser({ username: 'UserA' });
        const userB = await createTestUser({ username: 'UserB' });

        // Make them friends
        const { Friendship } = require('../../src/models/Friendship');
        await Friendship.create({
            userId: userA._id,
            friendId: userB._id,
            user: userA.username,
            friend: userB.username
        });

        const tokenA = generateAuthToken(userA);
        const tokenB = generateAuthToken(userB);

        // User A is already online
        const wsA = await createAuthenticatedClient(appServer, tokenA);

        // User B comes online
        const promiseOnline = waitForEvent(wsA, 'user_online', 5000);
        const wsB = await createAuthenticatedClient(appServer, tokenB);

        const onlineEvent = await promiseOnline;
        assert.strictEqual(onlineEvent.userId, userB._id.toString());
        assert.strictEqual(onlineEvent.username, userB.username);

        // User B goes offline
        const promiseOffline = waitForEvent(wsA, 'user_offline', 5000);
        wsB.close();

        const offlineEvent = await promiseOffline;
        assert.strictEqual(offlineEvent.userId, userB._id.toString());

        wsA.close();
    });

    it('should broadcast status updates to friends', async function () {
        const userA = await createTestUser({ username: 'UserA' });
        const userB = await createTestUser({ username: 'UserB' });

        // Make them friends
        const { Friendship } = require('../../src/models/Friendship');
        await Friendship.create({
            userId: userA._id,
            friendId: userB._id,
            user: userA.username,
            friend: userB.username
        });

        const tokenA = generateAuthToken(userA);
        const tokenB = generateAuthToken(userB);

        const wsA = await createAuthenticatedClient(appServer, tokenA);
        const wsB = await createAuthenticatedClient(appServer, tokenB);

        // Wait for presence syncs to finish so we have a clean slate
        await waitForEvent(wsA, 'presence_sync');
        await waitForEvent(wsB, 'presence_sync');

        const newStatus = 'Coding in TypeScript... 💻';

        const promiseStatus = waitForEvent(wsA, 'status_updated', 5000);

        sendEvent(wsB, 'set_status', { status: newStatus });

        const updateEvent = await promiseStatus;
        assert.strictEqual(updateEvent.userId, userB._id.toString());
        assert.strictEqual(updateEvent.status, newStatus);

        wsA.close();
        wsB.close();
    });
});
