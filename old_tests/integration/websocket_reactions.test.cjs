/**
 * WebSocket Reactions Integration Tests
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
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
const crypto = require('node:crypto');

describe('WebSocket Reaction Tests', { timeout: 30000 }, function () {
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

    describe('DM Reactions', function () {
        it('should add and remove reactions to DMs', async function () {
            const userA = await createTestUser({ username: 'UserA' });
            const userB = await createTestUser({ username: 'UserB' });

            // Make them friends
            const { Friendship } = require('../../src/models/Friendship');
            await Friendship.create({ userId: userA._id, friendId: userB._id, user: 'UserA', friend: 'UserB', active: true });
            await Friendship.create({ userId: userB._id, friendId: userA._id, user: 'UserB', friend: 'UserA', active: true });

            const tokenA = generateAuthToken(userA);
            const tokenB = generateAuthToken(userB);

            const wsA = await createAuthenticatedClient(appServer, tokenA);
            const wsB = await createAuthenticatedClient(appServer, tokenB);

            // 1. Send initial message
            const promiseMsgB = waitForEvent(wsB, 'message_dm', 5000);
            sendEvent(wsA, 'send_message_dm', {
                receiverId: userB._id.toString(),
                text: 'React to me'
            });
            const msgB = await promiseMsgB;
            const messageId = msgB.messageId;

            // 2. Add reaction from B
            const promiseReactionA = waitForEvent(wsA, 'reaction_added', 5000);
            sendEvent(wsB, 'add_reaction', {
                messageId,
                emoji: '👍',
                messageType: 'dm'
            });

            const reactionEventA = await promiseReactionA;
            assert.strictEqual(reactionEventA.messageId, messageId);
            assert.strictEqual(reactionEventA.emoji, '👍');
            assert.strictEqual(reactionEventA.userId, userB._id.toString());
            assert.strictEqual(reactionEventA.messageType, 'dm');

            // 3. Remove reaction from B
            const promiseRemovedA = waitForEvent(wsA, 'reaction_removed', 5000);
            sendEvent(wsB, 'remove_reaction', {
                messageId,
                emoji: '👍',
                messageType: 'dm'
            });

            const removedEventA = await promiseRemovedA;
            assert.strictEqual(removedEventA.messageId, messageId);
            assert.strictEqual(removedEventA.emoji, '👍');
            assert.strictEqual(removedEventA.userId, userB._id.toString());

            wsA.close();
            wsB.close();
        });
    });

    describe('Server Reactions', function () {
        it('should add and remove reactions to server messages', async function () {
            const owner = await createTestUser({ username: 'Owner' });
            const userB = await createTestUser({ username: 'UserB' });
            const tokenOwner = generateAuthToken(owner);
            const tokenB = generateAuthToken(userB);

            const server = await createTestServer(owner._id);
            const channel = await createTestChannel(server._id);

            // Add User B to server
            const { ServerMember } = require('../../src/models/Server');
            await ServerMember.create({ serverId: server._id, userId: userB._id, roles: [] });

            const wsOwner = await createAuthenticatedClient(appServer, tokenOwner);
            const wsB = await createAuthenticatedClient(appServer, tokenB);

            // Both join channel to receive events
            sendEvent(wsOwner, 'join_channel', {
                serverId: server._id.toString(),
                channelId: channel._id.toString()
            });
            await waitForEvent(wsOwner, 'channel_joined');

            sendEvent(wsB, 'join_channel', {
                serverId: server._id.toString(),
                channelId: channel._id.toString()
            });
            await waitForEvent(wsB, 'channel_joined');

            // 1. Send message
            const promiseMsgB = waitForEvent(wsB, 'message_server', 5000);
            sendEvent(wsOwner, 'send_message_server', {
                serverId: server._id.toString(),
                channelId: channel._id.toString(),
                text: 'Server message'
            });
            const msgB = await promiseMsgB;
            const messageId = msgB.messageId;

            // 2. Add reaction from B
            const promiseReactionOwner = waitForEvent(wsOwner, 'reaction_added', 5000);
            sendEvent(wsB, 'add_reaction', {
                messageId,
                emoji: '🔥',
                messageType: 'server'
            });

            const reactionEventOwner = await promiseReactionOwner;
            assert.strictEqual(reactionEventOwner.messageId, messageId);
            assert.strictEqual(reactionEventOwner.emoji, '🔥');
            assert.strictEqual(reactionEventOwner.userId, userB._id.toString());
            assert.strictEqual(reactionEventOwner.messageType, 'server');

            // 3. Remove reaction from B
            const promiseRemovedOwner = waitForEvent(wsOwner, 'reaction_removed', 5000);
            sendEvent(wsB, 'remove_reaction', {
                messageId,
                emoji: '🔥',
                messageType: 'server'
            });

            const removedEventOwner = await promiseRemovedOwner;
            assert.strictEqual(removedEventOwner.messageId, messageId);
            assert.strictEqual(removedEventOwner.emoji, '🔥');

            wsOwner.close();
            wsB.close();
        });
    });
});
