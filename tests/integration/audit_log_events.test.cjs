'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { setup, teardown, getApp } = require('./setup.cjs');
const {
    createTestUser,
    generateAuthToken,
    clearDatabase,
    createTestServer,
    createTestChannel,
    createTestMessage,
} = require('./helpers.cjs');
const {
    createAuthenticatedClient,
    sendEvent,
    waitForEvent,
} = require('./websocket_helpers.cjs');

async function addMemberWithPermissions(serverId, userId, permissions = {}) {
    const { Role, ServerMember } = require('../../src/models/Server');
    const role = await Role.create({
        serverId,
        name: `role_${Date.now()}`,
        position: 1,
        permissions: {
            sendMessages: true,
            manageMessages: false,
            deleteMessagesOfOthers: false,
            manageChannels: false,
            manageRoles: false,
            banMembers: false,
            kickMembers: false,
            manageInvites: false,
            manageServer: false,
            administrator: false,
            addReactions: true,
            manageReactions: false,
            viewChannels: true,
            ...permissions,
        },
    });
    const member = await ServerMember.create({
        serverId,
        userId,
        roles: [role._id],
    });
    return { role, member };
}

async function findAuditLog(serverId, actionType) {
    const { AuditLog } = require('../../src/models/AuditLog');
    return AuditLog.findOne({ serverId, actionType });
}

async function connectAndListen(appServer, token, serverId) {
    const ws = await createAuthenticatedClient(appServer, token);
    sendEvent(ws, 'join_server', { serverId: serverId.toString() });
    await waitForEvent(ws, 'server_joined');
    const promise = waitForEvent(ws, 'audit_log_entry_created', 8000);
    return { ws, promise };
}

describe('Audit Log Events', { timeout: 60000 }, function () {
    let appServer;
    let app;

    before(async function () {
        const data = await setup();
        appServer = data.server;
        app = getApp();
    });

    after(async function () {
        await teardown();
    });

    beforeEach(async function () {
        await clearDatabase();
    });

    describe('Server events', function () {
        it('creates audit log for update_server when server name changes', async function () {
            const owner = await createTestUser({ username: 'owner_upd_srv' });
            const token = generateAuthToken(owner);
            const server = await createTestServer(owner._id, { name: 'OldName' });

            const { ws, promise } = await connectAndListen(appServer, token, server._id);

            const res = await request(app)
                .patch(`/api/v1/servers/${server._id}`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'NewName' });

            assert.equal(res.status, 200);

            const log = await findAuditLog(server._id, 'update_server');
            assert.ok(log, 'audit log entry should exist in DB');
            assert.equal(log.actionType, 'update_server');

            const event = await promise;
            assert.equal(event.entry.action, 'update_server');
            assert.equal(event.serverId, server._id.toString());

            ws.close();
        });

        it('creates audit log for delete_server', async function () {
            const owner = await createTestUser({ username: 'owner_del_srv' });
            const token = generateAuthToken(owner);
            const server = await createTestServer(owner._id);

            const { ws, promise } = await connectAndListen(appServer, token, server._id);
            promise.catch(() => {});

            const res = await request(app)
                .delete(`/api/v1/servers/${server._id}`)
                .set('Authorization', `Bearer ${token}`);

            assert.equal(res.status, 200);

            const log = await findAuditLog(server._id, 'delete_server');
            assert.ok(log);
            assert.equal(log.actionType, 'delete_server');

            ws.close();
        });
    });

    describe('Member events', function () {
        it('creates audit log for user_kick', async function () {
            const owner = await createTestUser({ username: 'owner_kick' });
            const victim = await createTestUser({ username: 'victim_kick' });
            const token = generateAuthToken(owner);
            const server = await createTestServer(owner._id);

            const { ServerMember } = require('../../src/models/Server');
            await ServerMember.create({ serverId: server._id, userId: victim._id, roles: [] });

            const { ws, promise } = await connectAndListen(appServer, token, server._id);

            const res = await request(app)
                .delete(`/api/v1/servers/${server._id}/members/${victim._id}`)
                .set('Authorization', `Bearer ${token}`)
                .send({});

            assert.equal(res.status, 200, `Expected 200 got ${res.status}: ${JSON.stringify(res.body)}`);

            const log = await findAuditLog(server._id, 'user_kick');
            assert.ok(log);

            const event = await promise;
            assert.equal(event.entry.action, 'user_kick');

            ws.close();
        });

        it('creates audit log for user_ban', async function () {
            const owner = await createTestUser({ username: 'owner_ban' });
            const victim = await createTestUser({ username: 'victim_ban' });
            const token = generateAuthToken(owner);
            const server = await createTestServer(owner._id);

            const { ServerMember } = require('../../src/models/Server');
            await ServerMember.create({ serverId: server._id, userId: victim._id, roles: [] });

            const { ws, promise } = await connectAndListen(appServer, token, server._id);

            const res = await request(app)
                .post(`/api/v1/servers/${server._id}/bans`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: victim._id.toString(), reason: 'test ban' });

            assert.equal(res.status, 201, `Expected 201 got ${res.status}: ${JSON.stringify(res.body)}`);

            const log = await findAuditLog(server._id, 'user_ban');
            assert.ok(log);
            assert.equal(log.reason, 'test ban');

            const event = await promise;
            assert.equal(event.entry.action, 'user_ban');

            ws.close();
        });

        it('creates audit log for user_unban', async function () {
            const owner = await createTestUser({ username: 'owner_unban' });
            const victim = await createTestUser({ username: 'victim_unban' });
            const token = generateAuthToken(owner);
            const server = await createTestServer(owner._id);

            const { ServerBan } = require('../../src/models/Server');
            await ServerBan.create({
                serverId: server._id,
                userId: victim._id,
                bannedBy: owner._id,
                reason: 'pre-ban',
            });

            const { ws, promise } = await connectAndListen(appServer, token, server._id);

            const res = await request(app)
                .delete(`/api/v1/servers/${server._id}/bans/${victim._id}`)
                .set('Authorization', `Bearer ${token}`);

            assert.equal(res.status, 200, `Expected 200 got ${res.status}: ${JSON.stringify(res.body)}`);

            const log = await findAuditLog(server._id, 'user_unban');
            assert.ok(log);

            const event = await promise;
            assert.equal(event.entry.action, 'user_unban');

            ws.close();
        });

        it('creates audit log for role_given when adding a role to member', async function () {
            const owner = await createTestUser({ username: 'owner_rg' });
            const member = await createTestUser({ username: 'member_rg' });
            const token = generateAuthToken(owner);
            const server = await createTestServer(owner._id);

            const { ServerMember, Role } = require('../../src/models/Server');
            const role = await Role.create({
                serverId: server._id,
                name: 'TestRole',
                position: 1,
                permissions: {
                    sendMessages: true,
                    manageMessages: false,
                    deleteMessagesOfOthers: false,
                    manageChannels: false,
                    manageRoles: false,
                    banMembers: false,
                    kickMembers: false,
                    manageInvites: false,
                    manageServer: false,
                    administrator: false,
                    addReactions: true,
                    manageReactions: false,
                    viewChannels: true,
                },
            });
            await ServerMember.create({ serverId: server._id, userId: member._id, roles: [] });

            const { ws, promise } = await connectAndListen(appServer, token, server._id);

            const res = await request(app)
                .post(`/api/v1/servers/${server._id}/members/${member._id}/roles/${role._id}`)
                .set('Authorization', `Bearer ${token}`);

            assert.equal(res.status, 201, `Expected 201 got ${res.status}: ${JSON.stringify(res.body)}`);

            const log = await findAuditLog(server._id, 'role_given');
            assert.ok(log);

            const event = await promise;
            assert.equal(event.entry.action, 'role_given');

            ws.close();
        });

        it('creates audit log for role_removed when removing a role from member', async function () {
            const owner = await createTestUser({ username: 'owner_rr' });
            const member = await createTestUser({ username: 'member_rr' });
            const token = generateAuthToken(owner);
            const server = await createTestServer(owner._id);

            const { ServerMember, Role } = require('../../src/models/Server');
            const role = await Role.create({
                serverId: server._id,
                name: 'RemovableRole',
                position: 1,
                permissions: {
                    sendMessages: true,
                    manageMessages: false,
                    deleteMessagesOfOthers: false,
                    manageChannels: false,
                    manageRoles: false,
                    banMembers: false,
                    kickMembers: false,
                    manageInvites: false,
                    manageServer: false,
                    administrator: false,
                    addReactions: true,
                    manageReactions: false,
                    viewChannels: true,
                },
            });
            await ServerMember.create({ serverId: server._id, userId: member._id, roles: [role._id] });

            const { ws, promise } = await connectAndListen(appServer, token, server._id);

            const res = await request(app)
                .delete(`/api/v1/servers/${server._id}/members/${member._id}/roles/${role._id}`)
                .set('Authorization', `Bearer ${token}`);

            assert.equal(res.status, 200, `Expected 200 got ${res.status}: ${JSON.stringify(res.body)}`);

            const log = await findAuditLog(server._id, 'role_removed');
            assert.ok(log);

            const event = await promise;
            assert.equal(event.entry.action, 'role_removed');

            ws.close();
        });

        it('creates audit log for user_leave when member leaves server', async function () {
            const owner = await createTestUser({ username: 'owner_leave' });
            const leaver = await createTestUser({ username: 'leaver' });
            const ownerToken = generateAuthToken(owner);
            const leaverToken = generateAuthToken(leaver);
            const server = await createTestServer(owner._id);

            const { ServerMember } = require('../../src/models/Server');
            await ServerMember.create({ serverId: server._id, userId: leaver._id, roles: [] });

            const { ws, promise } = await connectAndListen(appServer, ownerToken, server._id);

            const res = await request(app)
                .delete(`/api/v1/servers/${server._id}/members/me`)
                .set('Authorization', `Bearer ${leaverToken}`);

            assert.equal(res.status, 200, `Expected 200 got ${res.status}: ${JSON.stringify(res.body)}`);

            const log = await findAuditLog(server._id, 'user_leave');
            assert.ok(log);

            const event = await promise;
            assert.equal(event.entry.action, 'user_leave');

            ws.close();
        });

        it('creates audit log for owner_changed when ownership is transferred', async function () {
            const owner = await createTestUser({ username: 'owner_transfer' });
            const newOwner = await createTestUser({ username: 'new_owner' });
            const token = generateAuthToken(owner);
            const server = await createTestServer(owner._id);

            const { ServerMember } = require('../../src/models/Server');
            await ServerMember.create({ serverId: server._id, userId: newOwner._id, roles: [] });

            const { ws, promise } = await connectAndListen(appServer, token, server._id);
            promise.catch(() => {});

            const res = await request(app)
                .post(`/api/v1/servers/${server._id}/transfer-ownership`)
                .set('Authorization', `Bearer ${token}`)
                .send({ newOwnerId: newOwner._id.toString() });

            assert.equal(res.status, 201, `Expected 201 got ${res.status}: ${JSON.stringify(res.body)}`);

            const log = await findAuditLog(server._id, 'owner_changed');
            assert.ok(log);
            assert.equal(log.actionType, 'owner_changed');

            ws.close();
        });

    });

    
    describe('Role events', function () {
        it('creates audit log for role_create', async function () {
            const owner = await createTestUser({ username: 'owner_role_create' });
            const token = generateAuthToken(owner);
            const server = await createTestServer(owner._id);

            const { ws, promise } = await connectAndListen(appServer, token, server._id);

            const res = await request(app)
                .post(`/api/v1/servers/${server._id}/roles`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'NewRole', color: '#ff0000' });

            assert.equal(res.status, 201, `Expected 201 got ${res.status}: ${JSON.stringify(res.body)}`);

            const log = await findAuditLog(server._id, 'role_create');
            assert.ok(log);
            assert.equal(log.metadata.roleName, 'NewRole');

            const event = await promise;
            assert.equal(event.entry.action, 'role_create');

            ws.close();
        });

        it('creates audit log for roles_reordered', async function () {
            const owner = await createTestUser({ username: 'owner_roles_reorder' });
            const token = generateAuthToken(owner);
            const server = await createTestServer(owner._id);

            const { Role } = require('../../src/models/Server');
            const role1 = await Role.create({
                serverId: server._id, name: 'RoleA', position: 1,
                permissions: { sendMessages: true, manageMessages: false, deleteMessagesOfOthers: false, manageChannels: false, manageRoles: false, banMembers: false, kickMembers: false, manageInvites: false, manageServer: false, administrator: false, addReactions: true, manageReactions: false, viewChannels: true },
            });
            const role2 = await Role.create({
                serverId: server._id, name: 'RoleB', position: 2,
                permissions: { sendMessages: true, manageMessages: false, deleteMessagesOfOthers: false, manageChannels: false, manageRoles: false, banMembers: false, kickMembers: false, manageInvites: false, manageServer: false, administrator: false, addReactions: true, manageReactions: false, viewChannels: true },
            });

            const { ws, promise } = await connectAndListen(appServer, token, server._id);

            const res = await request(app)
                .patch(`/api/v1/servers/${server._id}/roles/reorder`)
                .set('Authorization', `Bearer ${token}`)
                .send({ rolePositions: [{ roleId: role1._id.toString(), position: 2 }, { roleId: role2._id.toString(), position: 1 }] });

            assert.equal(res.status, 200, `Expected 200 got ${res.status}: ${JSON.stringify(res.body)}`);

            const log = await findAuditLog(server._id, 'roles_reordered');
            assert.ok(log);

            const event = await promise;
            assert.equal(event.entry.action, 'roles_reordered');

            ws.close();
        });

        it('creates audit log for role_update when role name changes', async function () {
            const owner = await createTestUser({ username: 'owner_role_update' });
            const token = generateAuthToken(owner);
            const server = await createTestServer(owner._id);

            const { Role } = require('../../src/models/Server');
            const role = await Role.create({
                serverId: server._id, name: 'OldRoleName', position: 1,
                permissions: { sendMessages: true, manageMessages: false, deleteMessagesOfOthers: false, manageChannels: false, manageRoles: false, banMembers: false, kickMembers: false, manageInvites: false, manageServer: false, administrator: false, addReactions: true, manageReactions: false, viewChannels: true },
            });

            const { ws, promise } = await connectAndListen(appServer, token, server._id);

            const res = await request(app)
                .patch(`/api/v1/servers/${server._id}/roles/${role._id}`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'UpdatedRoleName' });

            assert.equal(res.status, 200, `Expected 200 got ${res.status}: ${JSON.stringify(res.body)}`);

            const log = await findAuditLog(server._id, 'role_update');
            assert.ok(log);

            const event = await promise;
            assert.equal(event.entry.action, 'role_update');

            ws.close();
        });

        it('creates audit log for role_delete', async function () {
            const owner = await createTestUser({ username: 'owner_role_delete' });
            const token = generateAuthToken(owner);
            const server = await createTestServer(owner._id);

            const { Role } = require('../../src/models/Server');
            const role = await Role.create({
                serverId: server._id, name: 'DeleteMe', position: 1,
                permissions: { sendMessages: true, manageMessages: false, deleteMessagesOfOthers: false, manageChannels: false, manageRoles: false, banMembers: false, kickMembers: false, manageInvites: false, manageServer: false, administrator: false, addReactions: true, manageReactions: false, viewChannels: true },
            });

            const { ws, promise } = await connectAndListen(appServer, token, server._id);

            const res = await request(app)
                .delete(`/api/v1/servers/${server._id}/roles/${role._id}`)
                .set('Authorization', `Bearer ${token}`);

            assert.equal(res.status, 200, `Expected 200 got ${res.status}: ${JSON.stringify(res.body)}`);

            const log = await findAuditLog(server._id, 'role_delete');
            assert.ok(log);
            assert.equal(log.metadata.roleName, 'DeleteMe');

            const event = await promise;
            assert.equal(event.entry.action, 'role_delete');

            ws.close();
        });
    });

    describe('Channel & Category events', function () {
        it('creates audit log for create_channel', async function () {
            const owner = await createTestUser({ username: 'owner_create_ch' });
            const token = generateAuthToken(owner);
            const server = await createTestServer(owner._id);

            const { ws, promise } = await connectAndListen(appServer, token, server._id);

            const res = await request(app)
                .post(`/api/v1/servers/${server._id}/channels`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'new-channel', type: 'text' });

            assert.equal(res.status, 201, `Expected 201 got ${res.status}: ${JSON.stringify(res.body)}`);

            const log = await findAuditLog(server._id, 'create_channel');
            assert.ok(log);
            assert.equal(log.metadata.channelName, 'new-channel');

            const event = await promise;
            assert.equal(event.entry.action, 'create_channel');

            ws.close();
        });

        it('creates audit log for edit_channel when name changes', async function () {
            const owner = await createTestUser({ username: 'owner_edit_ch' });
            const token = generateAuthToken(owner);
            const server = await createTestServer(owner._id);
            const channel = await createTestChannel(server._id, { name: 'old-name' });

            const { ws, promise } = await connectAndListen(appServer, token, server._id);

            const res = await request(app)
                .patch(`/api/v1/servers/${server._id}/channels/${channel._id}`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'new-name' });

            assert.equal(res.status, 200, `Expected 200 got ${res.status}: ${JSON.stringify(res.body)}`);

            const log = await findAuditLog(server._id, 'edit_channel');
            assert.ok(log);

            const event = await promise;
            assert.equal(event.entry.action, 'edit_channel');

            ws.close();
        });

        it('creates audit log for delete_channel', async function () {
            const owner = await createTestUser({ username: 'owner_del_ch' });
            const token = generateAuthToken(owner);
            const server = await createTestServer(owner._id);
            const channel = await createTestChannel(server._id, { name: 'doomed-channel' });

            const { ws, promise } = await connectAndListen(appServer, token, server._id);

            const res = await request(app)
                .delete(`/api/v1/servers/${server._id}/channels/${channel._id}`)
                .set('Authorization', `Bearer ${token}`);

            assert.equal(res.status, 200, `Expected 200 got ${res.status}: ${JSON.stringify(res.body)}`);

            const log = await findAuditLog(server._id, 'delete_channel');
            assert.ok(log);
            assert.equal(log.metadata.channelName, 'doomed-channel');

            const event = await promise;
            assert.equal(event.entry.action, 'delete_channel');
            assert.equal(event.entry.metadata.channelName, 'doomed-channel');

            ws.close();
        });

        it('creates audit log for edit_channel when only the icon changes', async function () {
            const owner = await createTestUser({ username: 'owner_ch_icon' });
            const token = generateAuthToken(owner);
            const server = await createTestServer(owner._id);
            const channel = await createTestChannel(server._id, { name: 'icon-channel' });

            const { ws, promise } = await connectAndListen(appServer, token, server._id);

            const res = await request(app)
                .patch(`/api/v1/servers/${server._id}/channels/${channel._id}`)
                .set('Authorization', `Bearer ${token}`)
                .send({ icon: '🎮' });

            assert.equal(res.status, 200, `Expected 200 got ${res.status}: ${JSON.stringify(res.body)}`);

            const log = await findAuditLog(server._id, 'edit_channel');
            assert.ok(log, 'audit log entry should exist for channel icon change');
            const iconChange = log.changes.find((c) => c.field === 'icon');
            assert.ok(iconChange, 'changes should include icon field');
            assert.equal(iconChange.after, '🎮');

            const event = await promise;
            assert.equal(event.entry.action, 'edit_channel');

            ws.close();
        });

        it('creates audit log for channels_reordered', async function () {
            const owner = await createTestUser({ username: 'owner_ch_reorder' });
            const token = generateAuthToken(owner);
            const server = await createTestServer(owner._id);
            const ch1 = await createTestChannel(server._id, { name: 'alpha', position: 0 });
            const ch2 = await createTestChannel(server._id, { name: 'beta', position: 1 });

            const { ws, promise } = await connectAndListen(appServer, token, server._id);

            const res = await request(app)
                .patch(`/api/v1/servers/${server._id}/channels/reorder`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    channelPositions: [
                        { channelId: ch1._id.toString(), position: 1 },
                        { channelId: ch2._id.toString(), position: 0 },
                    ],
                });

            assert.equal(res.status, 200, `Expected 200 got ${res.status}: ${JSON.stringify(res.body)}`);

            const log = await findAuditLog(server._id, 'channels_reordered');
            assert.ok(log);
            assert.equal(log.changes.length, 2);
            assert.ok(log.changes.find((c) => c.field === 'Position: alpha' && c.before === 0 && c.after === 1));
            assert.ok(log.changes.find((c) => c.field === 'Position: beta' && c.before === 1 && c.after === 0));

            const event = await promise;
            assert.equal(event.entry.action, 'channels_reordered');

            ws.close();
        });

        it('creates audit log for channel_permissions_updated', async function () {
            const owner = await createTestUser({ username: 'owner_ch_perms' });
            const token = generateAuthToken(owner);
            const server = await createTestServer(owner._id);
            const channel = await createTestChannel(server._id, { name: 'perms-channel' });

            const { ws, promise } = await connectAndListen(appServer, token, server._id);

            const res = await request(app)
                .patch(`/api/v1/servers/${server._id}/channels/${channel._id}/permissions`)
                .set('Authorization', `Bearer ${token}`)
                .send({ permissions: { everyone: { sendMessages: false } } });

            assert.equal(res.status, 200, `Expected 200 got ${res.status}: ${JSON.stringify(res.body)}`);

            const log = await findAuditLog(server._id, 'channel_permissions_updated');
            assert.ok(log);
            assert.equal(log.metadata.channelName, 'perms-channel');
            assert.ok(log.changes.find((c) => c.field === '@everyone - sendMessages' && c.before === null && c.after === false));

            const event = await promise;
            assert.equal(event.entry.action, 'channel_permissions_updated');

            ws.close();
        });

        it('creates audit log for channel_permissions_updated when permission is reset (deleted) and resolves role names', async function () {
            const owner = await createTestUser({ username: 'owner_ch_perms2' });
            const token = generateAuthToken(owner);
            const server = await createTestServer(owner._id);
            const { Role } = require('../../src/models/Server');
            const role = await Role.create({ serverId: server._id, name: 'AdminRole', position: 1 });
            
            const { Channel } = require('../../src/models/Server');
            const channel = await Channel.create({ 
                serverId: server._id, 
                name: 'perms-channel-2',
                type: 'text',
                permissions: { [role._id.toString()]: { viewChannels: true, sendMessages: true } }
            });

            const { ws, promise } = await connectAndListen(appServer, token, server._id);
            const res = await request(app)
                .patch(`/api/v1/servers/${server._id}/channels/${channel._id}/permissions`)
                .set('Authorization', `Bearer ${token}`)
                .send({ permissions: { [role._id.toString()]: { viewChannels: true } } });

            assert.equal(res.status, 200, `Expected 200 got ${res.status}: ${JSON.stringify(res.body)}`);

            const log = await findAuditLog(server._id, 'channel_permissions_updated');
            assert.ok(log);
            assert.equal(log.metadata.channelName, 'perms-channel-2');
            
            const resetChange = log.changes.find((c) => c.field === 'AdminRole - sendMessages');
            assert.ok(resetChange, 'The permission reset should be captured in the changes array');
            assert.equal(resetChange.before, true);
            assert.equal(resetChange.after, null);

            const event = await promise;
            assert.equal(event.entry.action, 'channel_permissions_updated');

            ws.close();
        });

        it('creates audit log for create_category', async function () {
            const owner = await createTestUser({ username: 'owner_create_cat' });
            const token = generateAuthToken(owner);
            const server = await createTestServer(owner._id);

            const { ws, promise } = await connectAndListen(appServer, token, server._id);

            const res = await request(app)
                .post(`/api/v1/servers/${server._id}/categories`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'New Category' });

            assert.equal(res.status, 201, `Expected 201 got ${res.status}: ${JSON.stringify(res.body)}`);

            const log = await findAuditLog(server._id, 'create_category');
            assert.ok(log);
            assert.equal(log.metadata.categoryName, 'New Category');

            const event = await promise;
            assert.equal(event.entry.action, 'create_category');

            ws.close();
        });

        it('creates audit log for edit_category when name changes', async function () {
            const owner = await createTestUser({ username: 'owner_edit_cat' });
            const token = generateAuthToken(owner);
            const server = await createTestServer(owner._id);

            const { Category } = require('../../src/models/Server');
            const category = await Category.create({ serverId: server._id, name: 'OldCatName', position: 0 });

            const { ws, promise } = await connectAndListen(appServer, token, server._id);

            const res = await request(app)
                .patch(`/api/v1/servers/${server._id}/categories/${category._id}`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'NewCatName' });

            assert.equal(res.status, 200, `Expected 200 got ${res.status}: ${JSON.stringify(res.body)}`);

            const log = await findAuditLog(server._id, 'edit_category');
            assert.ok(log);

            const event = await promise;
            assert.equal(event.entry.action, 'edit_category');

            ws.close();
        });

        it('creates audit log for category_permissions_updated', async function () {
            const owner = await createTestUser({ username: 'owner_cat_perms' });
            const token = generateAuthToken(owner);
            const server = await createTestServer(owner._id);

            const { Category } = require('../../src/models/Server');
            const category = await Category.create({ serverId: server._id, name: 'PermsCategory', position: 0 });

            const { ws, promise } = await connectAndListen(appServer, token, server._id);

            const res = await request(app)
                .patch(`/api/v1/servers/${server._id}/categories/${category._id}/permissions`)
                .set('Authorization', `Bearer ${token}`)
                .send({ permissions: { everyone: { sendMessages: false } } });

            assert.equal(res.status, 200, `Expected 200 got ${res.status}: ${JSON.stringify(res.body)}`);

            const log = await findAuditLog(server._id, 'category_permissions_updated');
            assert.ok(log);
            assert.equal(log.metadata.categoryName, 'PermsCategory');
            assert.equal(log.changes.length, 1);
            assert.ok(log.changes.find((c) => c.field === '@everyone - sendMessages' && c.before === null && c.after === false));

            const event = await promise;
            assert.equal(event.entry.action, 'category_permissions_updated');

            ws.close();
        });

        it('creates audit log for delete_category', async function () {
            const owner = await createTestUser({ username: 'owner_del_cat' });
            const token = generateAuthToken(owner);
            const server = await createTestServer(owner._id);

            const { Category } = require('../../src/models/Server');
            const category = await Category.create({ serverId: server._id, name: 'Doomed Category', position: 0 });

            const { ws, promise } = await connectAndListen(appServer, token, server._id);

            const res = await request(app)
                .delete(`/api/v1/servers/${server._id}/categories/${category._id}`)
                .set('Authorization', `Bearer ${token}`);

            assert.equal(res.status, 200, `Expected 200 got ${res.status}: ${JSON.stringify(res.body)}`);

            const log = await findAuditLog(server._id, 'delete_category');
            assert.ok(log);
            assert.equal(log.metadata.categoryName, 'Doomed Category');

            const event = await promise;
            assert.equal(event.entry.action, 'delete_category');

            ws.close();
        });
    });

    describe('Invite events', function () {
        it('creates audit log for invite_create', async function () {
            const owner = await createTestUser({ username: 'owner_inv_create' });
            const token = generateAuthToken(owner);
            const server = await createTestServer(owner._id);

            const { ws, promise } = await connectAndListen(appServer, token, server._id);

            const res = await request(app)
                .post(`/api/v1/servers/${server._id}/invites`)
                .set('Authorization', `Bearer ${token}`)
                .send({ maxUses: 5 });

            assert.equal(res.status, 200, `Expected 200 got ${res.status}: ${JSON.stringify(res.body)}`);

            const log = await findAuditLog(server._id, 'invite_create');
            assert.ok(log);
            assert.ok(log.metadata.code, 'invite code should be in metadata');

            const event = await promise;
            assert.equal(event.entry.action, 'invite_create');

            ws.close();
        });

        it('creates audit log for invite_delete', async function () {
            const owner = await createTestUser({ username: 'owner_inv_delete' });
            const token = generateAuthToken(owner);
            const server = await createTestServer(owner._id);

            const createRes = await request(app)
                .post(`/api/v1/servers/${server._id}/invites`)
                .set('Authorization', `Bearer ${token}`)
                .send({});
            assert.equal(createRes.status, 200);
            const inviteId = createRes.body._id;

            const { ws, promise } = await connectAndListen(appServer, token, server._id);

            const res = await request(app)
                .delete(`/api/v1/servers/${server._id}/invites/${inviteId}`)
                .set('Authorization', `Bearer ${token}`);

            assert.equal(res.status, 200, `Expected 200 got ${res.status}: ${JSON.stringify(res.body)}`);

            const log = await findAuditLog(server._id, 'invite_delete');
            assert.ok(log);

            const event = await promise;
            assert.equal(event.entry.action, 'invite_delete');

            ws.close();
        });

        it('creates audit log for member_join when user joins via invite', async function () {
            const owner = await createTestUser({ username: 'owner_inv_join' });
            const joiner = await createTestUser({ username: 'joiner_inv' });
            const ownerToken = generateAuthToken(owner);
            const joinerToken = generateAuthToken(joiner);
            const server = await createTestServer(owner._id);

            const createRes = await request(app)
                .post(`/api/v1/servers/${server._id}/invites`)
                .set('Authorization', `Bearer ${ownerToken}`)
                .send({ customPath: 'jointest123' });
            assert.equal(createRes.status, 200);

            const { ws, promise } = await connectAndListen(appServer, ownerToken, server._id);

            const res = await request(app)
                .post('/api/v1/invites/jointest123/join')
                .set('Authorization', `Bearer ${joinerToken}`);

            assert.equal(res.status, 200, `Expected 200 got ${res.status}: ${JSON.stringify(res.body)}`);
            assert.equal(res.body.serverId, server._id.toString());

            const log = await findAuditLog(server._id, 'member_join');
            assert.ok(log);
            assert.equal(log.metadata.inviteCode, 'jointest123');

            const event = await promise;
            assert.equal(event.entry.action, 'member_join');

            ws.close();
        });
    });

    describe('Message events', function () {
        it('creates audit log for delete_message when moderator deletes another\'s message', async function () {
            const owner = await createTestUser({ username: 'owner_del_msg' });
            const sender = await createTestUser({ username: 'sender_del_msg' });
            const ownerToken = generateAuthToken(owner);
            const server = await createTestServer(owner._id);
            const channel = await createTestChannel(server._id);
            const message = await createTestMessage(server._id, channel._id, sender._id);

            const { ws, promise } = await connectAndListen(appServer, ownerToken, server._id);

            const res = await request(app)
                .delete(`/api/v1/servers/${server._id}/channels/${channel._id}/messages/${message._id}`)
                .set('Authorization', `Bearer ${ownerToken}`);

            assert.equal(res.status, 200, `Expected 200 got ${res.status}: ${JSON.stringify(res.body)}`);

            const log = await findAuditLog(server._id, 'delete_message');
            assert.ok(log);
            assert.equal(log.metadata.channelName, channel.name);

            const event = await promise;
            assert.equal(event.entry.action, 'delete_message');

            ws.close();
        });

        it('does NOT create audit log for delete_message when user deletes their own message', async function () {
            const owner = await createTestUser({ username: 'owner_self_del_msg' });
            const token = generateAuthToken(owner);
            const server = await createTestServer(owner._id);
            const channel = await createTestChannel(server._id);
            const message = await createTestMessage(server._id, channel._id, owner._id);

            const res = await request(app)
                .delete(`/api/v1/servers/${server._id}/channels/${channel._id}/messages/${message._id}`)
                .set('Authorization', `Bearer ${token}`);

            assert.equal(res.status, 200);

            const { AuditLog } = require('../../src/models/AuditLog');
            const log = await AuditLog.findOne({ serverId: server._id, actionType: 'delete_message' });
            assert.equal(log, null, 'audit log should NOT exist for self-deletion');
        });
    });

    describe('Reaction events', function () {
        it('creates audit log for reaction_clear when moderator bulk-removes an emoji', async function () {
            const owner = await createTestUser({ username: 'owner_react_clear' });
            const sender = await createTestUser({ username: 'sender_react' });
            const ownerToken = generateAuthToken(owner);
            const server = await createTestServer(owner._id);
            const channel = await createTestChannel(server._id);
            const message = await createTestMessage(server._id, channel._id, sender._id);

            const { ServerMember } = require('../../src/models/Server');
            await ServerMember.create({ serverId: server._id, userId: sender._id, roles: [] });

            const senderToken = generateAuthToken(sender);
            const addRes = await request(app)
                .post(`/api/v1/servers/${server._id}/channels/${channel._id}/messages/${message._id}/reactions`)
                .set('Authorization', `Bearer ${senderToken}`)
                .send({ emoji: '👍', emojiType: 'unicode' });
            if (addRes.status !== 201) {
                const { Reaction } = require('../../src/models/Reaction');
                await Reaction.create({
                    messageId: message._id,
                    messageType: 'server',
                    emoji: '👍',
                    emojiType: 'unicode',
                    userId: sender._id,
                });
            }

            const { ws, promise } = await connectAndListen(appServer, ownerToken, server._id);

            const res = await request(app)
                .delete(`/api/v1/servers/${server._id}/channels/${channel._id}/messages/${message._id}/reactions`)
                .set('Authorization', `Bearer ${ownerToken}`)
                .send({ emoji: '👍', emojiType: 'unicode' });

            if (res.status === 200) {
                const log = await findAuditLog(server._id, 'reaction_clear');
                assert.ok(log, 'audit log entry should exist in DB for reaction_clear');

                const event = await promise;
                assert.equal(event.entry.action, 'reaction_clear');
            }

            ws.close();
        });
    });


    describe('GET /api/v1/servers/:serverId/audit-log', function () {
        it('returns persisted audit log entries with correct shape', async function () {
            const owner = await createTestUser({ username: 'owner_get_log' });
            const token = generateAuthToken(owner);
            const server = await createTestServer(owner._id, { name: 'log-test-server' });

            await request(app)
                .patch(`/api/v1/servers/${server._id}`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'log-test-server-updated' });

            const res = await request(app)
                .get(`/api/v1/servers/${server._id}/audit-log`)
                .set('Authorization', `Bearer ${token}`);

            assert.equal(res.status, 200, `Expected 200 got ${res.status}: ${JSON.stringify(res.body)}`);
            assert.ok(Array.isArray(res.body.entries));
            assert.ok(res.body.entries.length >= 1);

            const entry = res.body.entries[0];
            assert.ok(entry.id, 'entry should have an id');
            assert.ok(entry.action, 'entry should have an action');
            assert.ok(entry.moderator, 'entry should have a moderator object');
            assert.ok(entry.moderator.id, 'entry.moderator should have an id');
            assert.ok(entry.createdAt, 'entry should have createdAt');
        });

        it('allows filtering by action type via ?action= query param', async function () {
            const owner = await createTestUser({ username: 'owner_filter_log' });
            const token = generateAuthToken(owner);
            const server = await createTestServer(owner._id, { name: 'filter-server' });

            await request(app)
                .patch(`/api/v1/servers/${server._id}`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'filter-server-2' });

            await request(app)
                .post(`/api/v1/servers/${server._id}/channels`)
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'new-ch', type: 'text' });

            const res = await request(app)
                .get(`/api/v1/servers/${server._id}/audit-log?action=create_channel`)
                .set('Authorization', `Bearer ${token}`);

            assert.equal(res.status, 200);
            assert.ok(Array.isArray(res.body.entries));
            for (const entry of res.body.entries) {
                assert.equal(entry.action, 'create_channel');
            }
        });

        it('returns 403 if user does not have manageServer permission', async function () {
            const owner = await createTestUser({ username: 'owner_403_log' });
            const viewer = await createTestUser({ username: 'viewer_403_log' });
            const ownerToken = generateAuthToken(owner);
            const viewerToken = generateAuthToken(viewer);
            const server = await createTestServer(owner._id);

            const { ServerMember } = require('../../src/models/Server');
            await ServerMember.create({ serverId: server._id, userId: viewer._id, roles: [] });

            const res = await request(app)
                .get(`/api/v1/servers/${server._id}/audit-log`)
                .set('Authorization', `Bearer ${viewerToken}`);

            assert.equal(res.status, 403);
        });
    });
});
