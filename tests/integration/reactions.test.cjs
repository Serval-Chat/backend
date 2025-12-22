const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { setup, teardown, getApp } = require('./setup.cjs');
const { createTestUser, createTestServer, createTestChannel, createTestMessage, generateAuthToken, clearDatabase } = require('./helpers.cjs');

describe('Reaction Integration Tests', () => {
    let app;
    let request;
    let user1;
    let user2;
    let token1;
    let token2;
    let server;
    let channel;
    let message;

    before(async () => {
        await setup();
        app = getApp();
        request = supertest(app);
    });

    after(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await clearDatabase();

        // Setup test data
        user1 = await createTestUser();
        user2 = await createTestUser();
        token1 = generateAuthToken(user1);
        token2 = generateAuthToken(user2);

        server = await createTestServer(user1._id);
        channel = await createTestChannel(server._id);

        // Add user1 (owner) to server
        const ServerMember = mongoose.model('ServerMember');
        await ServerMember.create({
            serverId: server._id,
            userId: user1._id,
            roles: []
        });

        // Add user2 to server
        await ServerMember.create({
            serverId: server._id,
            userId: user2._id,
            roles: []
        });

        // Create a server message from user1
        const ServerMessage = mongoose.model('ServerMessage');
        message = await ServerMessage.create({
            serverId: server._id,
            channelId: channel._id,
            senderId: user1._id,
            text: 'Hello world'
        });
    });

    describe('POST /api/v1/servers/:serverId/channels/:channelId/messages/:messageId/reactions', () => {
        test('should add a reaction successfully', async () => {
            const response = await request
                .post(`/api/v1/servers/${server._id}/channels/${channel._id}/messages/${message._id}/reactions`)
                .set('Authorization', `Bearer ${token2}`)
                .send({
                    emoji: '👍',
                    emojiType: 'unicode'
                });

            assert.strictEqual(response.status, 201);
            assert.strictEqual(response.body.reactions.length, 1);
            assert.strictEqual(response.body.reactions[0].emoji, '👍');
            assert.strictEqual(response.body.reactions[0].count, 1);
            assert.ok(response.body.reactions[0].users.includes(user2._id.toString()));
        });

        test('should prevent duplicate reactions from same user', async () => {
            // First reaction
            await request
                .post(`/api/v1/servers/${server._id}/channels/${channel._id}/messages/${message._id}/reactions`)
                .set('Authorization', `Bearer ${token2}`)
                .send({
                    emoji: '👍',
                    emojiType: 'unicode'
                });

            // Duplicate reaction
            const response = await request
                .post(`/api/v1/servers/${server._id}/channels/${channel._id}/messages/${message._id}/reactions`)
                .set('Authorization', `Bearer ${token2}`)
                .send({
                    emoji: '👍',
                    emojiType: 'unicode'
                });

            assert.strictEqual(response.status, 400);
            assert.ok(response.body.error.includes('already reacted'));
        });
    });

    describe('DELETE /api/v1/servers/:serverId/channels/:channelId/messages/:messageId/reactions', () => {
        test('should remove a reaction successfully', async () => {
            // Add reaction first
            await request
                .post(`/api/v1/servers/${server._id}/channels/${channel._id}/messages/${message._id}/reactions`)
                .set('Authorization', `Bearer ${token2}`)
                .send({
                    emoji: '👍',
                    emojiType: 'unicode'
                });

            // Remove reaction
            const response = await request
                .delete(`/api/v1/servers/${server._id}/channels/${channel._id}/messages/${message._id}/reactions`)
                .set('Authorization', `Bearer ${token2}`)
                .send({
                    emoji: '👍'
                });

            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.reactions.length, 0);
        });
    });

    describe('GET /api/v1/servers/:serverId/channels/:channelId/messages/:messageId/reactions', () => {
        test('should get reactions for a message', async () => {
            // Add reaction
            await request
                .post(`/api/v1/servers/${server._id}/channels/${channel._id}/messages/${message._id}/reactions`)
                .set('Authorization', `Bearer ${token2}`)
                .send({
                    emoji: '👍',
                    emojiType: 'unicode'
                });

            const response = await request
                .get(`/api/v1/servers/${server._id}/channels/${channel._id}/messages/${message._id}/reactions`)
                .set('Authorization', `Bearer ${token1}`);

            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.reactions.length, 1);
            assert.strictEqual(response.body.reactions[0].emoji, '👍');
        });
    });
});
