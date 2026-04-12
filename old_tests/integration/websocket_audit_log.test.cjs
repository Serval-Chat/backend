/**
 * WebSocket Audit Log Integration Tests
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
    createTestServer,
    createTestChannel,
    createTestMessage
} = require('./helpers.cjs');
const {
    createAuthenticatedClient,
    sendEvent,
    waitForEvent,
    ensureEventNotReceived
} = require('./websocket_helpers.cjs');

describe('WebSocket Audit Log Tests', { timeout: 30000 }, function () {
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

    it('SHOULD receive audit_log_entry_created when owner deletes another user\'s message', async function () {
        const owner = await createTestUser({ username: 'Owner' });
        const victim = await createTestUser({ username: 'Victim' });
        const tokenOwner = generateAuthToken(owner);

        const server = await createTestServer(owner._id);
        const channel = await createTestChannel(server._id);
        const message = await createTestMessage(server._id, channel._id, victim._id);

        const wsOwner = await createAuthenticatedClient(appServer, tokenOwner);

        sendEvent(wsOwner, 'join_server', { serverId: server._id.toString() });
        await waitForEvent(wsOwner, 'server_joined');

        const promiseAuditLog = waitForEvent(wsOwner, 'audit_log_entry_created', 5000);

        const res = await request(app)
            .delete(`/api/v1/servers/${server._id}/channels/${channel._id}/messages/${message._id}`)
            .set('Authorization', `Bearer ${tokenOwner}`)
            .send();

        assert.strictEqual(res.status, 200);

        const event = await promiseAuditLog;
        assert.strictEqual(event.serverId, server._id.toString());
        assert.strictEqual(event.entry.action, 'delete_message');
        assert.strictEqual(event.entry.moderator.id, owner._id.toString());

        wsOwner.close();
    });

    it('SHOULD receive audit_log_entry_created when moderator with manageServer permission deletes a message', async function () {
        const owner = await createTestUser({ username: 'Owner' });
        const moderator = await createTestUser({ username: 'Moderator' });
        const victim = await createTestUser({ username: 'Victim' });
        
        const tokenOwner = generateAuthToken(owner);
        const tokenModerator = generateAuthToken(moderator);

        const server = await createTestServer(owner._id);
        const channel = await createTestChannel(server._id);
        const message = await createTestMessage(server._id, channel._id, victim._id);

        // Create a role with manageServer permission
        const { Role, ServerMember } = require('../../src/models/Server');
        const role = await Role.create({
            serverId: server._id,
            name: 'Moderator Role',
            position: 1,
            permissions: {
                manageServer: true,
                viewChannels: true,
                manageMessages: true 
            }
        });

        await ServerMember.create({
            serverId: server._id,
            userId: moderator._id,
            roles: [role._id]
        });

        const wsModerator = await createAuthenticatedClient(appServer, tokenModerator);
        sendEvent(wsModerator, 'join_server', { serverId: server._id.toString() });
        await waitForEvent(wsModerator, 'server_joined');

        const promiseAuditLog = waitForEvent(wsModerator, 'audit_log_entry_created', 5000);

        const res = await request(app)
            .delete(`/api/v1/servers/${server._id}/channels/${channel._id}/messages/${message._id}`)
            .set('Authorization', `Bearer ${tokenModerator}`)
            .send();

        assert.strictEqual(res.status, 200);

        const event = await promiseAuditLog;
        assert.strictEqual(event.serverId, server._id.toString());
        assert.strictEqual(event.entry.action, 'delete_message');

        wsModerator.close();
    });

    it('SHOULD NOT receive audit_log_entry_created when member WITHOUT manageServer permission is joined', async function () {
        const owner = await createTestUser({ username: 'Owner' });
        const normalUser = await createTestUser({ username: 'NormalUser' });
        const victim = await createTestUser({ username: 'Victim' });
        
        const tokenOwner = generateAuthToken(owner);
        const tokenNormal = generateAuthToken(normalUser);

        const server = await createTestServer(owner._id);
        const channel = await createTestChannel(server._id);
        const message = await createTestMessage(server._id, channel._id, victim._id);

        const { ServerMember } = require('../../src/models/Server');
        await ServerMember.create({
            serverId: server._id,
            userId: normalUser._id,
            roles: []
        });

        const wsNormal = await createAuthenticatedClient(appServer, tokenNormal);
        sendEvent(wsNormal, 'join_server', { serverId: server._id.toString() });
        await waitForEvent(wsNormal, 'server_joined');

        const promiseNoEvent = ensureEventNotReceived(wsNormal, 'audit_log_entry_created', 2000);

        await request(app)
            .delete(`/api/v1/servers/${server._id}/channels/${channel._id}/messages/${message._id}`)
            .set('Authorization', `Bearer ${tokenOwner}`)
            .send();

        await promiseNoEvent;

        wsNormal.close();
    });

    it('SHOULD receive audit_log_entry_created when owner updates server settings', async function () {
        const owner = await createTestUser({ username: 'Owner' });
        const tokenOwner = generateAuthToken(owner);

        const server = await createTestServer(owner._id, { name: 'Initial Name' });

        const wsOwner = await createAuthenticatedClient(appServer, tokenOwner);
        sendEvent(wsOwner, 'join_server', { serverId: server._id.toString() });
        await waitForEvent(wsOwner, 'server_joined');

        const promiseAuditLog = waitForEvent(wsOwner, 'audit_log_entry_created', 5000);

        const res = await request(app)
            .patch(`/api/v1/servers/${server._id}`)
            .set('Authorization', `Bearer ${tokenOwner}`)
            .send({ name: 'New Shiny Name' });

        assert.strictEqual(res.status, 200);

        const event = await promiseAuditLog;
        assert.strictEqual(event.serverId, server._id.toString());
        assert.strictEqual(event.entry.action, 'update_server');

        wsOwner.close();
    });

    it('SHOULD receive audit_log_entry_created when owner deletes a channel', async function () {
        const owner = await createTestUser({ username: 'Owner' });
        const tokenOwner = generateAuthToken(owner);

        const server = await createTestServer(owner._id);
        const channel = await createTestChannel(server._id, { name: 'Delete Me' });

        const wsOwner = await createAuthenticatedClient(appServer, tokenOwner);
        sendEvent(wsOwner, 'join_server', { serverId: server._id.toString() });
        await waitForEvent(wsOwner, 'server_joined');

        const promiseAuditLog = waitForEvent(wsOwner, 'audit_log_entry_created', 5000);

        const res = await request(app)
            .delete(`/api/v1/servers/${server._id}/channels/${channel._id}`)
            .set('Authorization', `Bearer ${tokenOwner}`)
            .send();

        assert.strictEqual(res.status, 200);

        const event = await promiseAuditLog;
        assert.strictEqual(event.serverId, server._id.toString());
        assert.strictEqual(event.entry.action, 'delete_channel');
        assert.strictEqual(event.entry.metadata.channelName, 'Delete Me');
        assert.strictEqual(event.entry.target.name, 'Delete Me');

        wsOwner.close();
    });
});
