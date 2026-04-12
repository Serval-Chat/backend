const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setup, teardown, getApp } = require('./setup.cjs');
const { clearDatabase, createTestUser, generateAuthToken, createTestServer } = require('./helpers.cjs');
const { Role } = require('../../src/models/Server');

describe('Server Roles Integration Tests', () => {
    let app;
    let owner;
    let ownerToken;
    let member;
    let memberToken;
    let server;
    let everyoneRole;
    let customRole;

    before(async () => {
        await setup();
        app = getApp();
        await clearDatabase();

        // Create owner and member
        owner = await createTestUser();
        ownerToken = generateAuthToken(owner);
        member = await createTestUser();
        memberToken = generateAuthToken(member);

        // Create server (this creates @everyone role automatically)
        server = await createTestServer(owner._id);

        // Find the @everyone role
        everyoneRole = await Role.findOne({ serverId: server._id, name: '@everyone' });

        // Create a custom role
        customRole = await Role.create({
            serverId: server._id,
            name: 'Moderator',
            color: '#ff0000',
            position: 1,
            permissions: {
                sendMessages: true,
                manageMessages: true,
                deleteMessagesOfOthers: false,
                manageChannels: false,
                manageRoles: false,
                banMembers: false,
                kickMembers: false,
                manageInvites: false,
                manageServer: false,
                administrator: false,
                addReactions: true,
                manageReactions: false
            }
        });

        // Add member to server
        const { ServerMember } = require('../../src/models/Server');

        // Update owner member with roles
        await ServerMember.updateOne(
            { serverId: server._id, userId: owner._id },
            { $set: { roles: [everyoneRole._id] } }
        );

        // Add regular member
        await ServerMember.create({
            serverId: server._id,
            userId: member._id,
            roles: [everyoneRole._id]
        });
    });

    after(async () => {
        await teardown();
    });

    test('GET /api/v1/servers/:serverId/roles should return all server roles', async () => {
        const res = await request(app)
            .get(`/api/v1/servers/${server._id.toString()}/roles`)
            .set('Authorization', `Bearer ${ownerToken}`);

        // EXPECT SUCCESS (200) AFTER IMPLEMENTATION
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body));
        assert.equal(res.body.length, 2); // @everyone + Moderator

        // Check that both roles are present
        const roleNames = res.body.map(r => r.name);
        assert.ok(roleNames.includes('@everyone'));
        assert.ok(roleNames.includes('Moderator'));
    });
});
