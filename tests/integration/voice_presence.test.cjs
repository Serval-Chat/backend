/**
 * Voice Presence Integration Tests
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
    waitForEvent
} = require('./websocket_helpers.cjs');

describe('Voice Presence Tests', { timeout: 30000 }, function () {
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

    it('should allow joining voice channel with viewChannels and connect permissions', async function () {
        const user = await createTestUser();
        const server = await createTestServer(user._id);
        const channel = await createTestChannel(server._id, { type: 'voice', name: 'Voice' });

        const token = generateAuthToken(user);
        const ws = await createAuthenticatedClient(appServer, token);

        sendEvent(ws, 'join_voice', {
            serverId: server._id.toString(),
            channelId: channel._id.toString()
        });

        const response = await waitForEvent(ws, 'voice_joined');
        assert.strictEqual(response.success, true);
        assert.strictEqual(response.channelId, channel._id.toString());

        ws.close();
    });

    it('should deny joining voice channel without connect permission', async function () {
        const owner = await createTestUser();
        const user = await createTestUser();
        const server = await createTestServer(owner._id);
        const channel = await createTestChannel(server._id, { type: 'voice' });

        // Add user to server
        const { ServerMember, Role } = require('../../src/models/Server');
        await ServerMember.create({
            serverId: server._id,
            userId: user._id,
            roles: []
        });

        // Set @everyone role to deny connect
        await Role.findOneAndUpdate(
            { serverId: server._id, name: '@everyone' },
            { $set: { 'permissions.connect': false } }
        );

        const token = generateAuthToken(user);
        const ws = await createAuthenticatedClient(appServer, token);

        sendEvent(ws, 'join_voice', {
            serverId: server._id.toString(),
            channelId: channel._id.toString()
        });

        const errorResponse = await waitForEvent(ws, 'error');
        const errorMessage = errorResponse.details?.message || '';
        assert.ok(errorMessage.toLowerCase().includes('forbidden') || errorMessage.toLowerCase().includes('permission'));

        ws.close();
    });

    it('should set namespaced voice_states key with TTL in Redis', async function () {
        const user = await createTestUser();
        const server = await createTestServer(user._id);
        const channel = await createTestChannel(server._id, { type: 'voice' });

        const token = generateAuthToken(user);
        const ws = await createAuthenticatedClient(appServer, token);

        sendEvent(ws, 'join_voice', {
            serverId: server._id.toString(),
            channelId: channel._id.toString()
        });
        await waitForEvent(ws, 'voice_joined');

        // Send voice state update to trigger hset
        sendEvent(ws, 'update_voice_state', {
            serverId: server._id.toString(),
            channelId: channel._id.toString(),
            isMuted: true,
            isDeafened: false
        });
        await waitForEvent(ws, 'voice_state_updated');

        // Check Redis
        const { container } = require('../../src/di/container');
        const { TYPES } = require('../../src/di/types');
        const redisService = container.get(TYPES.RedisService);
        const redis = redisService.getClient();

        const hkey = `voice_states:${server._id}:${channel._id}`;
        const voiceKey = `voice_channel:${server._id}:${channel._id}`;
        const userVoiceKey = `user_voice:${user._id}`;

        const stateValue = await redis.hget(hkey, user._id.toString());
        assert.ok(stateValue, 'State should be in Redis');
        assert.deepStrictEqual(JSON.parse(stateValue), { isMuted: true, isDeafened: false });

        const ttl = await redis.ttl(hkey);
        assert.ok(ttl > 0 && ttl <= 86400, `TTL should be set for ${hkey}`);

        const voiceKeyTtl = await redis.ttl(voiceKey);
        assert.ok(voiceKeyTtl > 0 && voiceKeyTtl <= 86400, `TTL should be set for ${voiceKey}`);

        const userVoiceKeyTtl = await redis.ttl(userVoiceKey);
        assert.ok(userVoiceKeyTtl > 0 && userVoiceKeyTtl <= 86400, `TTL should be set for ${userVoiceKey}`);

        ws.close();
    });

    it('should correctly list voice participants via getVoiceStates API (verifies SCAN)', async function () {
        const user = await createTestUser();
        const server = await createTestServer(user._id);
        const channel = await createTestChannel(server._id, { type: 'voice' });

        const token = generateAuthToken(user);
        const ws = await createAuthenticatedClient(appServer, token);

        sendEvent(ws, 'join_voice', {
            serverId: server._id.toString(),
            channelId: channel._id.toString()
        });
        await waitForEvent(ws, 'voice_joined');

        const { getApp } = require('./setup.cjs');
        const request = require('supertest');
        
        const response = await request(getApp())
            .get(`/api/v1/servers/${server._id}/voice-states`)
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        assert.ok(response.body[channel._id.toString()], 'Channel should be in the voice states list');
        assert.ok(response.body[channel._id.toString()].includes(user._id.toString()), 'User should be in the participants list');

        ws.close();
    });
});
