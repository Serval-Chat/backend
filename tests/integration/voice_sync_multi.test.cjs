/**
 * Multi-user Voice Synchronization Integration Tests
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

describe('Multi-user Voice Sync Tests', { timeout: 30000 }, function () {
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

    it('should synchronize participants when multiple users join the same channel', async function () {
        const user1 = await createTestUser();
        const user2 = await createTestUser();
        const server = await createTestServer(user1._id);
        const channel = await createTestChannel(server._id, { type: 'voice' });

        // Add user2 to server
        const { ServerMember } = require('../../src/models/Server');
        await ServerMember.create({
            serverId: server._id,
            userId: user2._id,
            roles: []
        });

        const ws1 = await createAuthenticatedClient(appServer, generateAuthToken(user1));
        const ws2 = await createAuthenticatedClient(appServer, generateAuthToken(user2));

        // User 1 joins
        sendEvent(ws1, 'join_voice', {
            serverId: server._id.toString(),
            channelId: channel._id.toString()
        });
        const v1_joined = await waitForEvent(ws1, 'voice_joined');
        assert.strictEqual(v1_joined.success, true);
        assert.ok(v1_joined.participants.includes(user1._id.toString()));

        // User 2 joins
        sendEvent(ws2, 'join_voice', {
            serverId: server._id.toString(),
            channelId: channel._id.toString()
        });
        
        // User 1 should get user_joined_voice
        const v1_user_joined = await waitForEvent(ws1, 'user_joined_voice');
        assert.strictEqual(v1_user_joined.userId, user2._id.toString());
        assert.strictEqual(v1_user_joined.channelId, channel._id.toString());

        // User 2 should get voice_joined with user1 already there
        const v2_joined = await waitForEvent(ws2, 'voice_joined');
        assert.strictEqual(v2_joined.success, true);
        assert.ok(v2_joined.participants.includes(user1._id.toString()));
        assert.ok(v2_joined.participants.includes(user2._id.toString()));

        ws1.close();
        ws2.close();
    });

    it('should correctly handle user moving between voice channels', async function () {
        const user = await createTestUser();
        const server = await createTestServer(user._id);
        const channel1 = await createTestChannel(server._id, { type: 'voice', name: 'Voice 1' });
        const channel2 = await createTestChannel(server._id, { type: 'voice', name: 'Voice 2' });

        const ws = await createAuthenticatedClient(appServer, generateAuthToken(user));

        // Join Voice 1
        sendEvent(ws, 'join_voice', {
            serverId: server._id.toString(),
            channelId: channel1._id.toString()
        });
        await waitForEvent(ws, 'voice_joined');

        // Join Voice 2
        sendEvent(ws, 'join_voice', {
            serverId: server._id.toString(),
            channelId: channel2._id.toString()
        });
        const v_joined2 = await waitForEvent(ws, 'voice_joined');
        assert.strictEqual(v_joined2.channelId, channel2._id.toString());

        // Check Redis
        const { container } = require('../../src/di/container');
        const { TYPES } = require('../../src/di/types');
        const redisService = container.get(TYPES.RedisService);
        const redis = redisService.getClient();

        const inChannel1 = await redis.sismember(`voice_channel:${server._id}:${channel1._id}`, user._id.toString());
        const inChannel2 = await redis.sismember(`voice_channel:${server._id}:${channel2._id}`, user._id.toString());
        const userVoice = await redis.get(`user_voice:${user._id}`);

        assert.strictEqual(inChannel1, 0, 'User should be removed from Channel 1');
        assert.strictEqual(inChannel2, 1, 'User should be in Channel 2');
        assert.strictEqual(userVoice, `${server._id}:${channel2._id}`, 'User voice state should point to Channel 2');

        ws.close();
    });
});
