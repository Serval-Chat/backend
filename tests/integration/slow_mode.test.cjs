/**
 * Slow Mode Integration Tests
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
    createTestChannel,
    updateChannel
} = require('./helpers.cjs');
const {
    createAuthenticatedClient,
    sendEvent,
    waitForEvent
} = require('./websocket_helpers.cjs');

describe('Slow Mode Tests', { timeout: 30000 }, function () {
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

    it('should enforce slow mode for regular users', async function () {
        const owner = await createTestUser({ username: 'Owner' });
        const member = await createTestUser({ username: 'Member' });
        const tokenOwner = generateAuthToken(owner);
        const tokenMember = generateAuthToken(member);

        const server = await createTestServer(owner._id);
        const channel = await createTestChannel(server._id);

        // Set slow mode to 5 seconds
        const { Channel } = require('../../src/models/Server');
        await Channel.findByIdAndUpdate(channel._id, { slowMode: 5 });

        // Add Member to server
        const { ServerMember } = require('../../src/models/Server');
        await ServerMember.create({ serverId: server._id, userId: member._id, roles: [] });

        const wsMember = await createAuthenticatedClient(appServer, tokenMember);

        // Member joins channel
        sendEvent(wsMember, 'join_channel', {
            serverId: server._id.toString(),
            channelId: channel._id.toString()
        });
        await waitForEvent(wsMember, 'channel_joined');

        // Send first message
        sendEvent(wsMember, 'send_message_server', {
            serverId: server._id.toString(),
            channelId: channel._id.toString(),
            text: 'First message'
        });
        await waitForEvent(wsMember, 'message_server_sent');

        // Send second message immediately
        const promiseError = waitForEvent(wsMember, 'error', 5000).catch(() => null);
        
        sendEvent(wsMember, 'send_message_server', {
            serverId: server._id.toString(),
            channelId: channel._id.toString(),
            text: 'Second message'
        });

        const errorMsg = await promiseError;
        assert.ok(errorMsg, 'Should receive an error when sending too fast');
        assert.ok(errorMsg.details.message.includes('too fast'), 'Error message should mention slow mode');

        wsMember.close();
    });

    it('should bypass slow mode for admins', async function () {
        const owner = await createTestUser({ username: 'Owner' });
        const tokenOwner = generateAuthToken(owner);

        const server = await createTestServer(owner._id);
        const channel = await createTestChannel(server._id);

        // Set slow mode to 5 seconds
        const { Channel } = require('../../src/models/Server');
        await Channel.findByIdAndUpdate(channel._id, { slowMode: 5 });

        const wsOwner = await createAuthenticatedClient(appServer, tokenOwner);

        // Owner joins channel
        sendEvent(wsOwner, 'join_channel', {
            serverId: server._id.toString(),
            channelId: channel._id.toString()
        });
        await waitForEvent(wsOwner, 'channel_joined');

        // Send first message
        sendEvent(wsOwner, 'send_message_server', {
            serverId: server._id.toString(),
            channelId: channel._id.toString(),
            text: 'First message'
        });
        await waitForEvent(wsOwner, 'message_server_sent');

        // Send second message immediately
        sendEvent(wsOwner, 'send_message_server', {
            serverId: server._id.toString(),
            channelId: channel._id.toString(),
            text: 'Second message'
        });
        
        const msg = await waitForEvent(wsOwner, 'message_server_sent', 5000);
        assert.strictEqual(msg.text, 'Second message');

        wsOwner.close();
    });
});
