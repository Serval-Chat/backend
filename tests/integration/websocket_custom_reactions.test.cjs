/**
 * WebSocket Custom Reactions Integration Tests
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { setup, teardown } = require('./setup.cjs');
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

describe('WebSocket Custom Reaction Tests', { timeout: 30000 }, function () {
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

    it('should add and remove custom reactions to server messages', async function () {
        const userA = await createTestUser({ username: 'UserA' });
        const userB = await createTestUser({ username: 'UserB' });
        const tokenA = generateAuthToken(userA);
        const tokenB = generateAuthToken(userB);

        const server = await createTestServer(userA._id);
        const channel = await createTestChannel(server._id);

        // Add User B to server
        const { ServerMember } = require('../../src/models/Server');
        await ServerMember.create({ serverId: server._id, userId: userB._id, roles: [] });

        // Create a custom emoji in the DB
        const { Emoji } = require('../../src/models/Emoji');
        const customEmoji = await Emoji.create({
            name: 'party_blob',
            imageUrl: 'https://example.com/blob.png',
            serverId: server._id,
            createdBy: userA._id
        });

        const wsA = await createAuthenticatedClient(appServer, tokenA);
        const wsB = await createAuthenticatedClient(appServer, tokenB);

        // Both join channel
        sendEvent(wsA, 'join_channel', { serverId: server._id.toString(), channelId: channel._id.toString() });
        await waitForEvent(wsA, 'channel_joined');
        sendEvent(wsB, 'join_channel', { serverId: server._id.toString(), channelId: channel._id.toString() });
        await waitForEvent(wsB, 'channel_joined');

        // 1. Send message from A
        const promiseMsgB = waitForEvent(wsB, 'message_server', 5000);
        sendEvent(wsA, 'send_message_server', {
            serverId: server._id.toString(),
            channelId: channel._id.toString(),
            text: 'Custom reaction test'
        });
        const msgB = await promiseMsgB;
        const messageId = msgB.messageId;

        // 2. Add custom reaction from A
        const promiseReactionB = waitForEvent(wsB, 'reaction_added', 5000);
        sendEvent(wsA, 'add_reaction', {
            messageId,
            emoji: 'party_blob',
            emojiType: 'custom',
            emojiId: customEmoji._id.toString(),
            messageType: 'server'
        });

        const reactionEventB = await promiseReactionB;
        assert.strictEqual(reactionEventB.messageId, messageId);
        assert.strictEqual(reactionEventB.emoji, 'party_blob');
        assert.strictEqual(reactionEventB.emojiType, 'custom');
        assert.strictEqual(reactionEventB.emojiId, customEmoji._id.toString());

        // 3. Remove custom reaction from A
        const promiseRemovedB = waitForEvent(wsB, 'reaction_removed', 5000);
        sendEvent(wsA, 'remove_reaction', {
            messageId,
            emoji: 'party_blob',
            emojiType: 'custom',
            emojiId: customEmoji._id.toString(),
            messageType: 'server'
        });

        const removedEventB = await promiseRemovedB;
        assert.strictEqual(removedEventB.messageId, messageId);
        assert.strictEqual(removedEventB.emoji, 'party_blob');
        assert.strictEqual(removedEventB.emojiType, 'custom');
        assert.strictEqual(removedEventB.emojiId, customEmoji._id.toString());

        wsA.close();
        wsB.close();
    });

    it('should fail if custom emojiId is missing', async function () {
        const user = await createTestUser({ username: 'Tester2' });
        const token = generateAuthToken(user);
        const ws = await createAuthenticatedClient(appServer, token);

        const promiseError = waitForEvent(ws, 'error', 5000);
        sendEvent(ws, 'add_reaction', {
            messageId: new mongoose.Types.ObjectId().toString(),
            emoji: 'missing_id',
            emojiType: 'custom',
            messageType: 'dm'
        });

        const errorEvent = await promiseError;
        assert.strictEqual(errorEvent.code, 'MALFORMED_MESSAGE');
        // Zod refinement message
        assert(JSON.stringify(errorEvent.details).includes('Emoji ID is required for custom emojis'));

        ws.close();
    });
});
