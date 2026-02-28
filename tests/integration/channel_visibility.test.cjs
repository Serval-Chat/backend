const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { setup, teardown, getApp } = require('./setup.cjs');
const { createTestUser, createTestServer, createTestChannel, generateAuthToken, clearDatabase } = require('./helpers.cjs');

describe('Channel Visibility Integration Tests', () => {
    let app;
    let request;
    let owner;
    let member;
    let tokenOwner;
    let tokenMember;
    let server;
    let visibleChannel;
    let hiddenChannel;
    let hiddenRole;

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

        owner = await createTestUser();
        member = await createTestUser();

        tokenOwner = generateAuthToken(owner);
        tokenMember = generateAuthToken(member);

        server = await createTestServer(owner._id);

        // Create two channels
        visibleChannel = await createTestChannel(server._id, { name: 'visible' });
        hiddenChannel = await createTestChannel(server._id, { name: 'hidden' });

        // Create a role that hides the 'hidden' channel
        const { Role, ServerMember } = require('../../src/models/Server');

        hiddenRole = await Role.create({
            serverId: server._id,
            name: 'Hidden Role',
            position: 1,
            permissions: {
                sendMessages: true,
                viewChannel: true // Server-wide allow
            }
        });

        // Add member with the role
        await ServerMember.create({
            serverId: server._id,
            userId: member._id,
            roles: [hiddenRole._id]
        });

        // Add override to hiddenChannel to DENY viewChannel for hiddenRole
        const { Channel } = require('../../src/models/Server');
        await Channel.updateOne(
            { _id: hiddenChannel._id },
            {
                $set: {
                    [`permissions.${hiddenRole._id}`]: { viewChannel: false }
                }
            }
        );
    });

    test('should only list visible channels for member', async () => {
        const response = await request
            .get(`/api/v1/servers/${server._id}/channels`)
            .set('Authorization', `Bearer ${tokenMember}`);

        assert.strictEqual(response.status, 200);
        assert.ok(Array.isArray(response.body));

        const channelNames = response.body.map(c => c.name);
        assert.ok(channelNames.includes('visible'));
        assert.ok(!channelNames.includes('hidden'));
    });

    test('should deny access to hidden channel messages', async () => {
        const response = await request
            .get(`/api/v1/servers/${server._id}/channels/${hiddenChannel._id}/messages`)
            .set('Authorization', `Bearer ${tokenMember}`);

        assert.strictEqual(response.status, 403);
    });

    test('should deny access to hidden channel details/stats', async () => {
        const response = await request
            .get(`/api/v1/servers/${server._id}/channels/${hiddenChannel._id}/stats`)
            .set('Authorization', `Bearer ${tokenMember}`);

        assert.strictEqual(response.status, 404);
    });

    test('should show both channels for owner', async () => {
        const response = await request
            .get(`/api/v1/servers/${server._id}/channels`)
            .set('Authorization', `Bearer ${tokenOwner}`);

        assert.strictEqual(response.status, 200);
        const channelNames = response.body.map(c => c.name);
        assert.ok(channelNames.includes('visible'));
        assert.ok(channelNames.includes('hidden'));
    });

    test('should handle member with no roles assigned (default permissions)', async () => {
        const noRoleMember = await createTestUser();
        const tokenNoRole = generateAuthToken(noRoleMember);
        const { ServerMember } = require('../../src/models/Server');

        await ServerMember.create({
            serverId: server._id,
            userId: noRoleMember._id,
            roles: []
        });

        const response = await request
            .get(`/api/v1/servers/${server._id}/channels`)
            .set('Authorization', `Bearer ${tokenNoRole}`);

        assert.strictEqual(response.status, 200);
        const channelNames = response.body.map(c => c.name);
        assert.ok(channelNames.includes('visible'));
        assert.ok(channelNames.includes('hidden'));
    });

    test('should respect default @everyone permissions when no role overrides exist', async () => {
        const { Role } = require('../../src/models/Server');
        const everyoneRole = await Role.findOne({ serverId: server._id, name: '@everyone' });

        // Deny viewChannel for @everyone at the server level
        await Role.updateOne(
            { _id: everyoneRole._id },
            { $set: { 'permissions.viewChannel': false } }
        );

        // A member with no roles should now see nothing
        const noRoleMember = await createTestUser();
        const tokenNoRole = generateAuthToken(noRoleMember);
        const { ServerMember } = require('../../src/models/Server');
        await ServerMember.create({
            serverId: server._id,
            userId: noRoleMember._id,
            roles: []
        });

        const response = await request
            .get(`/api/v1/servers/${server._id}/channels`)
            .set('Authorization', `Bearer ${tokenNoRole}`);

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.length, 0);
    });
});
