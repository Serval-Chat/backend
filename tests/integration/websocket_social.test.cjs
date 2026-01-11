/**
 * WebSocket Social & Friendship Integration Tests
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const {
    setup,
    teardown,
    getApp
} = require('./setup.cjs');
const {
    createTestUser,
    generateAuthToken,
    clearDatabase
} = require('./helpers.cjs');
const {
    createAuthenticatedClient,
    waitForEvent
} = require('./websocket_helpers.cjs');

describe('WebSocket Social Tests', { timeout: 30000 }, function () {
    let appServer;
    let app;

    before(async function () {
        const setupData = await setup();
        appServer = setupData.server;
        app = getApp();
    });

    after(async function () {
        await teardown();
    });

    beforeEach(async function () {
        await clearDatabase();
    });

    it('should receive incoming_request_added when a friend request is sent', async function () {
        const userA = await createTestUser({ username: 'UserA' });
        const userB = await createTestUser({ username: 'UserB' });
        const tokenA = generateAuthToken(userA);
        const tokenB = generateAuthToken(userB);

        // User B is online listening for requests
        const wsB = await createAuthenticatedClient(appServer, tokenB);
        const promiseRequest = waitForEvent(wsB, 'incoming_request_added', 5000);

        // User A sends request via HTTP
        const res = await request(app)
            .post('/api/v1/friends')
            .set('Authorization', `Bearer ${tokenA}`)
            .send({ username: 'UserB' });

        assert.strictEqual(res.status, 201);

        const event = await promiseRequest;
        assert.strictEqual(event.from, 'UserA');
        assert.strictEqual(event.fromId, userA._id.toString());
        assert.ok(event._id, 'Should have a request ID');

        wsB.close();
    });

    it('should receive friend_added and incoming_request_removed when a request is accepted', async function () {
        const userA = await createTestUser({ username: 'UserA' });
        const userB = await createTestUser({ username: 'UserB' });
        const tokenA = generateAuthToken(userA);
        const tokenB = generateAuthToken(userB);

        // User A sends request to User B first
        const { FriendRequest } = require('../../src/models/Friendship');
        const fr = await FriendRequest.create({
            from: 'UserA',
            to: 'UserB',
            fromId: userA._id,
            toId: userB._id,
            status: 'pending'
        });

        // Both go online
        const wsA = await createAuthenticatedClient(appServer, tokenA);
        const wsB = await createAuthenticatedClient(appServer, tokenB);

        // B accepts A's request
        const promiseA = waitForEvent(wsA, 'friend_added', 5000);
        const promiseB = waitForEvent(wsB, 'friend_added', 5000);
        const promiseRemovedB = waitForEvent(wsB, 'incoming_request_removed', 5000);

        const res = await request(app)
            .post(`/api/v1/friends/${fr._id}/accept`)
            .set('Authorization', `Bearer ${tokenB}`)
            .send();

        assert.strictEqual(res.status, 201);

        const eventA = await promiseA;
        const eventB = await promiseB;
        const eventRemovedB = await promiseRemovedB;

        assert.strictEqual(eventA.friend.username, 'UserB');
        assert.strictEqual(eventB.friend.username, 'UserA');
        assert.strictEqual(eventRemovedB.fromId, userA._id.toString());

        wsA.close();
        wsB.close();
    });

    it('should receive friend_removed when a friend is removed', async function () {
        const userA = await createTestUser({ username: 'UserA' });
        const userB = await createTestUser({ username: 'UserB' });
        const tokenA = generateAuthToken(userA);
        const tokenB = generateAuthToken(userB);

        // They are already friends
        const { Friendship } = require('../../src/models/Friendship');
        await Friendship.create({ userId: userA._id, friendId: userB._id, user: 'UserA', friend: 'UserB' });
        await Friendship.create({ userId: userB._id, friendId: userA._id, user: 'UserB', friend: 'UserA' });

        // Both go online
        const wsA = await createAuthenticatedClient(appServer, tokenA);
        const wsB = await createAuthenticatedClient(appServer, tokenB);

        const promiseA = waitForEvent(wsA, 'friend_removed', 5000);
        const promiseB = waitForEvent(wsB, 'friend_removed', 5000);

        // A removes B
        const res = await request(app)
            .delete(`/api/v1/friends/${userB._id}`)
            .set('Authorization', `Bearer ${tokenA}`)
            .send();

        assert.strictEqual(res.status, 200);

        const eventA = await promiseA;
        const eventB = await promiseB;

        assert.strictEqual(eventA.userId, userB._id.toString());
        assert.strictEqual(eventB.userId, userA._id.toString());

        wsA.close();
        wsB.close();
    });
});
