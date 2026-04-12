/**
 * WebSocket Server Notifications Integration Tests
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const {
    setup,
    teardown,
    getApp
} = require('./setup.cjs');
const {
    createTestUser,
    generateAuthToken,
    clearDatabase,
    createTestServer
} = require('./helpers.cjs');
const {
    createAuthenticatedClient,
    sendEvent,
    waitForEvent
} = require('./websocket_helpers.cjs');

describe('WebSocket Server Notification Tests', { timeout: 30000 }, function () {
    let appServer;
    let app;

    before(async function () {
        const setupData = await setup();
        appServer = setupData.server;
        app = getApp();
    });

    after(async function () {
        await teardown();
    });

    beforeEach(async function () {
        await clearDatabase();
    });

    it('should receive server_updated when server name is changed via HTTP', async function () {
        const owner = await createTestUser({ username: 'Owner' });
        const member = await createTestUser({ username: 'Member' });
        const tokenOwner = generateAuthToken(owner);
        const tokenMember = generateAuthToken(member);

        const server = await createTestServer(owner._id, { name: 'Old Name' });

        // Add Member to server
        const { ServerMember } = require('../../src/models/Server');
        await ServerMember.create({ serverId: server._id, userId: member._id, roles: [] });

        const wsMember = await createAuthenticatedClient(appServer, tokenMember);

        // Member must join server to receive broadcasts
        sendEvent(wsMember, 'join_server', { serverId: server._id.toString() });
        await waitForEvent(wsMember, 'server_joined');

        const promiseUpdate = waitForEvent(wsMember, 'server_updated', 5000);

        // Owner updates name via HTTP
        const newName = 'Extremely Cool Server';
        const res = await request(app)
            .patch(`/api/v1/servers/${server._id}`)
            .set('Authorization', `Bearer ${tokenOwner}`)
            .send({ name: newName });

        assert.strictEqual(res.status, 200);

        const event = await promiseUpdate;
        assert.strictEqual(event.serverId, server._id.toString());
        assert.strictEqual(event.server.name, newName);

        wsMember.close();
    });

    it('should receive server_deleted when server is deleted via HTTP', async function () {
        const owner = await createTestUser({ username: 'Owner' });
        const member = await createTestUser({ username: 'Member' });
        const tokenOwner = generateAuthToken(owner);
        const tokenMember = generateAuthToken(member);

        const server = await createTestServer(owner._id);

        const { ServerMember } = require('../../src/models/Server');
        await ServerMember.create({ serverId: server._id, userId: member._id, roles: [] });

        const wsMember = await createAuthenticatedClient(appServer, tokenMember);
        sendEvent(wsMember, 'join_server', { serverId: server._id.toString() });
        await waitForEvent(wsMember, 'server_joined');

        const promiseDelete = waitForEvent(wsMember, 'server_deleted', 5000);

        // Owner deletes server via HTTP
        const res = await request(app)
            .delete(`/api/v1/servers/${server._id}`)
            .set('Authorization', `Bearer ${tokenOwner}`)
            .send();

        assert.strictEqual(res.status, 200);

        const event = await promiseDelete;
        assert.strictEqual(event.serverId, server._id.toString());

        wsMember.close();
    });
});
