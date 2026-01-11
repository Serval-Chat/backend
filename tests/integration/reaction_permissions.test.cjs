const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { setup, teardown, getApp } = require('./setup.cjs');
const { createTestUser, createTestServer, createTestChannel, generateAuthToken, clearDatabase } = require('./helpers.cjs');

describe('Reaction Permissions Integration Tests', () => {
    let app;
    let request;
    let owner;
    let userWithPerms;
    let userWithoutPerms;
    let tokenOwner;
    let tokenWithPerms;
    let tokenWithoutPerms;
    let server;
    let channel;
    let message;
    let roleWithPerms;
    let roleWithoutPerms;

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
        owner = await createTestUser();
        userWithPerms = await createTestUser();
        userWithoutPerms = await createTestUser();

        tokenOwner = generateAuthToken(owner);
        tokenWithPerms = generateAuthToken(userWithPerms);
        tokenWithoutPerms = generateAuthToken(userWithoutPerms);

        server = await createTestServer(owner._id);
        channel = await createTestChannel(server._id);

        // Create roles
        const Role = mongoose.model('Role');

        // Role with addReactions: true, manageReactions: true
        roleWithPerms = await Role.create({
            serverId: server._id,
            name: 'With Perms',
            permissions: {
                sendMessages: true,
                addReactions: true,
                manageReactions: true
            }
        });

        // Role with addReactions: false, manageReactions: false
        roleWithoutPerms = await Role.create({
            serverId: server._id,
            name: 'Without Perms',
            permissions: {
                sendMessages: true,
                addReactions: false,
                manageReactions: false
            }
        });

        // Add users to server with roles
        const ServerMember = mongoose.model('ServerMember');

        await ServerMember.create({
            serverId: server._id,
            userId: userWithPerms._id,
            roles: [roleWithPerms._id]
        });

        await ServerMember.create({
            serverId: server._id,
            userId: userWithoutPerms._id,
            roles: [roleWithoutPerms._id]
        });

        // Create a server message from owner
        const ServerMessage = mongoose.model('ServerMessage');
        message = await ServerMessage.create({
            serverId: server._id,
            channelId: channel._id,
            senderId: owner._id,
            text: 'Hello world'
        });
    });

    describe('Add Reactions Permission', () => {
        test('should allow user with permission to add reaction', async () => {
            const response = await request
                .post(`/api/v1/servers/${server._id}/channels/${channel._id}/messages/${message._id}/reactions`)
                .set('Authorization', `Bearer ${tokenWithPerms}`)
                .send({
                    emoji: '👍',
                    emojiType: 'unicode'
                });

            assert.strictEqual(response.status, 201);
        });

        test('should deny user without permission to add reaction', async () => {
            const response = await request
                .post(`/api/v1/servers/${server._id}/channels/${channel._id}/messages/${message._id}/reactions`)
                .set('Authorization', `Bearer ${tokenWithoutPerms}`)
                .send({
                    emoji: '👍',
                    emojiType: 'unicode'
                });

            assert.strictEqual(response.status, 403);
            assert.ok(response.body.error.includes('Missing permission'));
        });
    });

    describe('Manage Reactions Permission', () => {
        test('should allow user with permission to remove ANY reaction', async () => {
            // First, owner adds a reaction
            const responseAdd = await request
                .post(`/api/v1/servers/${server._id}/channels/${channel._id}/messages/${message._id}/reactions`)
                .set('Authorization', `Bearer ${tokenOwner}`)
                .send({
                    emoji: '👍',
                    emojiType: 'unicode'
                });

            assert.strictEqual(responseAdd.status, 201);

            // User with perms tries to remove it
            const response = await request
                .delete(`/api/v1/servers/${server._id}/channels/${channel._id}/messages/${message._id}/reactions`)
                .set('Authorization', `Bearer ${tokenWithPerms}`)
                .send({
                    emoji: '👍'
                });

            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.reactions.length, 0);
        });

        test('should deny user without permission to remove OTHERS reaction', async () => {
            // First, owner adds a reaction
            await request
                .post(`/api/v1/servers/${server._id}/channels/${channel._id}/messages/${message._id}/reactions`)
                .set('Authorization', `Bearer ${tokenOwner}`)
                .send({
                    emoji: '👍',
                    emojiType: 'unicode'
                });

            // User without perms tries to remove it
            const response = await request
                .delete(`/api/v1/servers/${server._id}/channels/${channel._id}/messages/${message._id}/reactions`)
                .set('Authorization', `Bearer ${tokenWithoutPerms}`)
                .send({
                    emoji: '👍'
                });

            // Should fail because they didn't react with it, and they don't have manageReactions

            assert.strictEqual(response.status, 404);
        });

        test('should allow user without permission to remove THEIR OWN reaction', async () => {
            // Temporarily give addReactions to userWithoutPerms so they can react first
            const Role = mongoose.model('Role');
            await Role.updateOne({ _id: roleWithoutPerms._id }, { 'permissions.addReactions': true });

            // User adds reaction
            await request
                .post(`/api/v1/servers/${server._id}/channels/${channel._id}/messages/${message._id}/reactions`)
                .set('Authorization', `Bearer ${tokenWithoutPerms}`)
                .send({
                    emoji: '👍',
                    emojiType: 'unicode'
                });

            // Remove permission again (optional, but good for clarity)
            await Role.updateOne({ _id: roleWithoutPerms._id }, { 'permissions.addReactions': false });

            // User removes their own reaction
            const response = await request
                .delete(`/api/v1/servers/${server._id}/channels/${channel._id}/messages/${message._id}/reactions`)
                .set('Authorization', `Bearer ${tokenWithoutPerms}`)
                .send({
                    emoji: '👍'
                });

            assert.strictEqual(response.status, 200);
        });
    });
});
