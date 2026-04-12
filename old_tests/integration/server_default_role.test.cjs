
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setup, teardown, getApp } = require('./setup.cjs');
const { clearDatabase, createTestUser, generateAuthToken, createTestServer } = require('./helpers.cjs');
const { Role } = require('../../src/models/Server');

describe('Server Default Role Integration Tests', () => {
    let app;
    let owner;
    let ownerToken;
    let server;
    let newRole;

    before(async () => {
        await setup();
        app = getApp();
        await clearDatabase();

        // Create owner
        owner = await createTestUser();
        ownerToken = generateAuthToken(owner);

        // Create server
        server = await createTestServer(owner._id);

        // Create a new role to set as default
        newRole = await Role.create({
            serverId: server._id,
            name: 'New Default Role',
            position: 1,
            permissions: { sendMessages: true }
        });
    });

    after(async () => {
        await teardown();
    });

    test('PATCH /api/v1/servers/:serverId/default-role should update default role', async () => {
        const res = await request(app)
            .patch(`/api/v1/servers/${server._id}/default-role`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ roleId: newRole._id.toString() });

        // EXPECT SUCCESS (200) AFTER IMPLEMENTATION
        assert.equal(res.status, 200);
        assert.equal(res.body.defaultRoleId, newRole._id.toString());
    });
});
