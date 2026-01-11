/**
 * WebSocket Mentions Integration Tests
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
    clearDatabase,
    createTestServer,
    createTestChannel
} = require('./helpers.cjs');
const {
    createAuthenticatedClient,
    sendEvent,
    waitForEvent
} = require('./websocket_helpers.cjs');

describe('WebSocket Mention Tests', { timeout: 30000 }, function () {
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

    it('should receive a mention event when mentioned in a server channel', async function () {
        const userA = await createTestUser({ username: 'UserA' });
        const userB = await createTestUser({ username: 'UserB' });
        const tokenA = generateAuthToken(userA);
        const tokenB = generateAuthToken(userB);

        const server = await createTestServer(userA._id);
        const channel = await createTestChannel(server._id);

        // Add User B to server
        const { ServerMember } = require('../../src/models/Server');
        await ServerMember.create({ serverId: server._id, userId: userB._id, roles: [] });

        const wsA = await createAuthenticatedClient(appServer, tokenA);
        const wsB = await createAuthenticatedClient(appServer, tokenB);

        // User B joins server to receive broadcasts (though ping is broadcastToUser, joining helps state)
        sendEvent(wsB, 'join_server', { serverId: server._id.toString() });
        await waitForEvent(wsB, 'server_joined');

        const promiseMention = waitForEvent(wsB, 'mention', 5000);

        // User A mentions User B
        sendEvent(wsA, 'send_message_server', {
            serverId: server._id.toString(),
            channelId: channel._id.toString(),
            text: `Hey <userid:'${userB._id.toString()}'>, check this out!`
        });

        const mention = await promiseMention;
        assert.strictEqual(mention.type, 'mention');
        assert.strictEqual(mention.senderId, userA._id.toString());
        assert.strictEqual(mention.serverId, server._id.toString());
        assert.strictEqual(mention.channelId, channel._id.toString());
        assert.strictEqual(mention.message.text, `Hey <userid:'${userB._id.toString()}'>, check this out!`);

        wsA.close();
        wsB.close();
    });

    it('should receive a mention event for @everyone mentions if permitted', async function () {
        const owner = await createTestUser({ username: 'Owner' });
        const member = await createTestUser({ username: 'Member' });
        const tokenOwner = generateAuthToken(owner);
        const tokenMember = generateAuthToken(member);

        const server = await createTestServer(owner._id);
        const channel = await createTestChannel(server._id);

        const { ServerMember } = require('../../src/models/Server');
        await ServerMember.create({ serverId: server._id, userId: member._id, roles: [] });

        const wsOwner = await createAuthenticatedClient(appServer, tokenOwner);
        const wsMember = await createAuthenticatedClient(appServer, tokenMember);

        const promiseMention = waitForEvent(wsMember, 'mention', 5000);

        // Owner mentions @everyone
        sendEvent(wsOwner, 'send_message_server', {
            serverId: server._id.toString(),
            channelId: channel._id.toString(),
            text: 'Hello <everyone>!'
        });

        const mention = await promiseMention;
        assert.strictEqual(mention.type, 'mention');
        assert.strictEqual(mention.senderId, owner._id.toString());
        assert.strictEqual(mention.message.text, 'Hello <everyone>!');

        wsOwner.close();
        wsMember.close();
    });
});
