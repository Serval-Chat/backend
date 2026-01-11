/**
 * WebSocket Chat Integration Tests (DM & Server)
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
    waitForEvent,
    ensureEventNotReceived
} = require('./websocket_helpers.cjs');

describe('WebSocket Chat Tests', { timeout: 30000 }, function () {
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

    describe('Direct Messages (DM)', function () {
        it('should send and receive DMs correctly', async function () {
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

            const text = 'Hello from User A!';
            const promiseB = waitForEvent(wsB, 'message_dm', 5000);

            sendEvent(wsA, 'send_message_dm', {
                receiverId: userB._id.toString(),
                text: text
            });

            const msgB = await promiseB;
            assert.strictEqual(msgB.text, text);
            assert.strictEqual(msgB.senderId, userA._id.toString());

            wsA.close();
            wsB.close();
        });

        it('should broadcast typing indicators in DMs', async function () {
            const userA = await createTestUser({ username: 'UserA' });
            const userB = await createTestUser({ username: 'UserB' });

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
            assert.strictEqual(event.senderUsername, 'UserA');

            wsA.close();
            wsB.close();
        });

        it('should track DM unread count correctly', async function () {
            const userA = await createTestUser({ username: 'UserA' });
            const userB = await createTestUser({ username: 'UserB' });

            const { Friendship } = require('../../src/models/Friendship');
            await Friendship.create({ userId: userA._id, friendId: userB._id, user: 'UserA', friend: 'UserB' });
            await Friendship.create({ userId: userB._id, friendId: userA._id, user: 'UserB', friend: 'UserA' });

            const tokenA = generateAuthToken(userA);
            const tokenB = generateAuthToken(userB);

            const wsA = await createAuthenticatedClient(appServer, tokenA);
            const wsB = await createAuthenticatedClient(appServer, tokenB);

            const promiseUnread = waitForEvent(wsB, 'dm_unread_updated', 5000);

            sendEvent(wsA, 'send_message_dm', {
                receiverId: userB._id.toString(),
                text: 'Message 1'
            });

            const event = await promiseUnread;
            assert.strictEqual(event.count, 1);
            assert.strictEqual(event.peerUsername, 'UserA');

            wsA.close();
            wsB.close();
        });
    });

    describe('Server Messages', function () {
        it('should send and receive server messages correctly', async function () {
            const owner = await createTestUser({ username: 'Owner' });
            const member = await createTestUser({ username: 'Member' });
            const tokenOwner = generateAuthToken(owner);
            const tokenMember = generateAuthToken(member);

            const server = await createTestServer(owner._id);
            const channel = await createTestChannel(server._id);

            // Add Member to server
            const { ServerMember } = require('../../src/models/Server');
            await ServerMember.create({ serverId: server._id, userId: member._id, roles: [] });

            const wsOwner = await createAuthenticatedClient(appServer, tokenOwner);
            const wsMember = await createAuthenticatedClient(appServer, tokenMember);

            // Member joins server and channel
            sendEvent(wsMember, 'join_server', { serverId: server._id.toString() });
            await waitForEvent(wsMember, 'server_joined');
            sendEvent(wsMember, 'join_channel', {
                serverId: server._id.toString(),
                channelId: channel._id.toString()
            });
            await waitForEvent(wsMember, 'channel_joined');

            const text = 'Hello Server!';
            const promiseMsg = waitForEvent(wsMember, 'message_server', 5000);
            
            sendEvent(wsOwner, 'join_server', { serverId: server._id.toString() });
            await waitForEvent(wsOwner, 'server_joined');
            sendEvent(wsOwner, 'join_channel', {
                serverId: server._id.toString(),
                channelId: channel._id.toString()
            });
            await waitForEvent(wsOwner, 'channel_joined');

            sendEvent(wsOwner, 'send_message_server', {
                serverId: server._id.toString(),
                channelId: channel._id.toString(),
                text: text
            });

            const msg = await promiseMsg;
            assert.strictEqual(msg.text, text);
            assert.strictEqual(msg.senderId, owner._id.toString());

            wsOwner.close();
            wsMember.close();
        });
    });

    it('should broadcast typing indicators in server channels', async function () {
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

        // Join channel B
        sendEvent(wsB, 'join_channel', {
            serverId: server._id.toString(),
            channelId: channel._id.toString()
        });
        await waitForEvent(wsB, 'channel_joined');

        const promiseTyping = waitForEvent(wsB, 'typing_server', 5000);

        sendEvent(wsA, 'typing_server', {
            serverId: server._id.toString(),
            channelId: channel._id.toString()
        });

        const event = await promiseTyping;
        assert.strictEqual(event.senderId, userA._id.toString());
        assert.strictEqual(event.channelId, channel._id.toString());

        wsA.close();
        wsB.close();
    });
});

