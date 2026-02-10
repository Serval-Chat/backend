const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setup, teardown, getApp } = require('./setup.cjs');
const { clearDatabase, createTestUser, generateAuthToken, createTestServer } = require('./helpers.cjs');
const { Role, ServerMember } = require('../../src/models/Server');

describe('Role Icons Integration Tests', () => {
    let app;
    let owner;
    let ownerToken;
    let member;
    let memberToken;
    let server;
    let role;

    // Minimal 1x1 PNG
    const testImageBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        'base64'
    );

    before(async () => {
        await setup();
        app = getApp();
        await clearDatabase();

        // Create owner and member
        owner = await createTestUser();
        ownerToken = generateAuthToken(owner);
        member = await createTestUser();
        memberToken = generateAuthToken(member);

        // Create server
        server = await createTestServer(owner._id);

        // Create a role to test with
        role = await Role.create({
            serverId: server._id,
            name: 'IconRole',
            permissions: {}
        });

        // Add member to server without permissions
        const everyoneRole = await Role.findOne({ serverId: server._id, name: '@everyone' });
        await ServerMember.create({
            serverId: server._id,
            userId: member._id,
            roles: [everyoneRole._id]
        });
    });

    after(async () => {
        await teardown();
    });

    test('POST /api/v1/servers/:serverId/roles/:roleId/icon - Owner can upload icon', async () => {
        const res = await request(app)
            .post(`/api/v1/servers/${server._id}/roles/${role._id}/icon`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .attach('icon', testImageBuffer, 'test-icon.png');

        assert.equal(res.status, 200);
        assert.ok(res.body.icon);
        assert.match(res.body.icon, /\.webp$/); // Should be converted to webp

        // Update local role reference for next tests
        role = await Role.findById(role._id);
    });

    test('GET /api/v1/servers/:serverId/roles/icon/:filename - Can retrieve icon', async () => {
        assert.ok(role.icon, 'Role must have an icon from previous test');

        const res = await request(app)
            .get(`/api/v1/servers/${server._id}/roles/icon/${role.icon}`);

        assert.equal(res.status, 200);
        assert.equal(res.headers['content-type'], 'image/webp');
    });

    test('POST /api/v1/servers/:serverId/roles/:roleId/icon - Member without permission cannot upload', async () => {
        const res = await request(app)
            .post(`/api/v1/servers/${server._id}/roles/${role._id}/icon`)
            .set('Authorization', `Bearer ${memberToken}`)
            .attach('icon', testImageBuffer, 'fail.png');

        assert.equal(res.status, 403);
    });

    test('POST /api/v1/servers/:serverId/roles/:roleId/icon - Invalid file type fails', async () => {
        const res = await request(app)
            .post(`/api/v1/servers/${server._id}/roles/${role._id}/icon`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .attach('icon', Buffer.from('not an image'), 'test.txt');

        assert.equal(res.status, 400);
    });
});
