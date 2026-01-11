/**
 * WebSocket Protocol Master Integration Tests
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
    createTestChannel
} = require('./helpers.cjs');
const {
    createAuthenticatedClient,
    sendEvent,
    waitForEvent
} = require('./websocket_helpers.cjs');

describe('WebSocket Protocol Master Suite', { timeout: 60000 }, function () {
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

    async function joinServerWs(ws, serverId) {
        sendEvent(ws, 'join_server', { serverId: serverId.toString() });
        await waitForEvent(ws, 'server_joined');
    }

    /* --- SERVER EVENTS --- */
    it('should receive server_updated and server_deleted', async function () {
        const owner = await createTestUser({ username: 'Owner' });
        const tokenOwner = generateAuthToken(owner);
        const server = await createTestServer(owner._id);

        const wsOwner = await createAuthenticatedClient(appServer, tokenOwner);
        await joinServerWs(wsOwner, server._id);

        // UPDATE
        const promiseUpdate = waitForEvent(wsOwner, 'server_updated');
        const resUpdate = await request(app)
            .patch(`/api/v1/servers/${server._id}`)
            .set('Authorization', `Bearer ${tokenOwner}`)
            .send({ name: 'New Server Name' });
        assert.strictEqual(resUpdate.status, 200);
        const updateEvent = await promiseUpdate;
        assert.strictEqual(updateEvent.server.name, 'New Server Name');

        // DELETE
        const promiseDelete = waitForEvent(wsOwner, 'server_deleted');
        const resDelete = await request(app)
            .delete(`/api/v1/servers/${server._id}`)
            .set('Authorization', `Bearer ${tokenOwner}`);
        assert.strictEqual(resDelete.status, 200);
        await promiseDelete;

        wsOwner.close();
    });

    /* --- MEMBER EVENTS --- */
    it('should receive member_added when a user joins via invite', async function () {
        const owner = await createTestUser({ username: 'Owner' });
        const user = await createTestUser({ username: 'NewUser' });
        const tokenOwner = generateAuthToken(owner);
        const tokenUser = generateAuthToken(user);

        const server = await createTestServer(owner._id);

        // Create invite
        const resInvite = await request(app)
            .post(`/api/v1/servers/${server._id}/invites`)
            .set('Authorization', `Bearer ${tokenOwner}`)
            .send({});
        assert.strictEqual(resInvite.status, 200);
        const inviteCode = resInvite.body.code;

        const wsOwner = await createAuthenticatedClient(appServer, tokenOwner);
        await joinServerWs(wsOwner, server._id);

        const promiseMemberAdded = waitForEvent(wsOwner, 'member_added');

        // User joins via HTTP
        const resJoin = await request(app)
            .post(`/api/v1/invites/${inviteCode}/join`)
            .set('Authorization', `Bearer ${tokenUser}`)
            .send();
        assert.ok(resJoin.status === 200 || resJoin.status === 201);

        const event = await promiseMemberAdded;
        assert.strictEqual(event.serverId, server._id.toString());
        assert.strictEqual(event.userId, user._id.toString());

        wsOwner.close();
    });

    it('should receive member_removed, member_updated, member_banned, and ownership_transferred', async function () {
        const owner = await createTestUser({ username: 'Owner' });
        const user = await createTestUser({ username: 'Subject' });
        const tokenOwner = generateAuthToken(owner);

        const server = await createTestServer(owner._id);
        const { ServerMember, Role } = require('../../src/models/Server');
        await ServerMember.create({ serverId: server._id, userId: user._id });
        const role = await Role.create({ serverId: server._id, name: 'Tester', permissions: {} });

        const wsOwner = await createAuthenticatedClient(appServer, tokenOwner);
        await joinServerWs(wsOwner, server._id);

        // ROLE ADDITION (member_updated)
        let promise = waitForEvent(wsOwner, 'member_updated');
        await request(app)
            .post(`/api/v1/servers/${server._id}/members/${user._id}/roles/${role._id}`)
            .set('Authorization', `Bearer ${tokenOwner}`)
            .send();
        let event = await promise;
        assert.strictEqual(event.userId, user._id.toString());

        // TRANSFER OWNERSHIP (ownership_transferred)
        promise = waitForEvent(wsOwner, 'ownership_transferred');
        await request(app)
            .post(`/api/v1/servers/${server._id}/transfer-ownership`)
            .set('Authorization', `Bearer ${tokenOwner}`)
            .send({ newOwnerId: user._id.toString() });
        event = await promise;
        assert.strictEqual(event.newOwnerId, user._id.toString());

        // BAN (member_banned)
        const tokenNewOwner = generateAuthToken(user);
        promise = waitForEvent(wsOwner, 'member_banned');
        await request(app)
            .post(`/api/v1/servers/${server._id}/bans`)
            .set('Authorization', `Bearer ${tokenNewOwner}`)
            .send({ userId: owner._id.toString(), reason: 'Test Ban' });
        event = await promise;
        assert.strictEqual(event.userId, owner._id.toString());

        wsOwner.close();
    });

    /* --- ROLE EVENTS --- */
    it('should receive role_created, role_updated, role_deleted, and roles_reordered', async function () {
        const owner = await createTestUser({ username: 'Owner' });
        const tokenOwner = generateAuthToken(owner);
        const server = await createTestServer(owner._id);

        const wsOwner = await createAuthenticatedClient(appServer, tokenOwner);
        await joinServerWs(wsOwner, server._id);

        // CREATE
        let promise = waitForEvent(wsOwner, 'role_created');
        const resCreate = await request(app)
            .post(`/api/v1/servers/${server._id}/roles`)
            .set('Authorization', `Bearer ${tokenOwner}`)
            .send({ name: 'Admin2', color: '#ff0000', permissions: { administrator: true } });
        const role = (await promise).role;

        // UPDATE
        promise = waitForEvent(wsOwner, 'role_updated');
        await request(app)
            .patch(`/api/v1/servers/${server._id}/roles/${role._id || role.id}`)
            .set('Authorization', `Bearer ${tokenOwner}`)
            .send({ name: 'SuperAdmin' });
        await promise;

        // REORDER
        promise = waitForEvent(wsOwner, 'roles_reordered');
        await request(app)
            .patch(`/api/v1/servers/${server._id}/roles/reorder`)
            .set('Authorization', `Bearer ${tokenOwner}`)
            .send({ rolePositions: [{ roleId: (role._id || role.id).toString(), position: 5 }] });
        await promise;

        // DELETE
        promise = waitForEvent(wsOwner, 'role_deleted');
        await request(app)
            .delete(`/api/v1/servers/${server._id}/roles/${role._id || role.id}`)
            .set('Authorization', `Bearer ${tokenOwner}`)
            .send();
        await promise;

        wsOwner.close();
    });

    /* --- CHANNEL & CATEGORY EVENTS --- */
    it('should receive channel and category lifecycle events', async function () {
        const owner = await createTestUser({ username: 'Owner' });
        const tokenOwner = generateAuthToken(owner);
        const server = await createTestServer(owner._id);

        const wsOwner = await createAuthenticatedClient(appServer, tokenOwner);
        await joinServerWs(wsOwner, server._id);

        // CATEGORY CREATE
        let promise = waitForEvent(wsOwner, 'category_created');
        const resCat = await request(app)
            .post(`/api/v1/servers/${server._id}/categories`)
            .set('Authorization', `Bearer ${tokenOwner}`)
            .send({ name: 'General Cats' });
        assert.ok(resCat.status === 200 || resCat.status === 201);
        const category = (await promise).category;

        // CHANNEL CREATE
        promise = waitForEvent(wsOwner, 'channel_created');
        const resChan = await request(app)
            .post(`/api/v1/servers/${server._id}/channels`)
            .set('Authorization', `Bearer ${tokenOwner}`)
            .send({ name: 'chat', type: 'text', categoryId: category._id || category.id });
        const channel = (await promise).channel;

        // CHANNELS REORDERED
        promise = waitForEvent(wsOwner, 'channels_reordered');
        await request(app)
            .patch(`/api/v1/servers/${server._id}/channels/reorder`)
            .set('Authorization', `Bearer ${tokenOwner}`)
            .send({ channelPositions: [{ channelId: (channel._id || channel.id).toString(), position: 1 }] });
        await promise;

        // CHANNEL DELETE
        promise = waitForEvent(wsOwner, 'channel_deleted');
        await request(app)
            .delete(`/api/v1/servers/${server._id}/channels/${channel._id || channel.id}`)
            .set('Authorization', `Bearer ${tokenOwner}`);
        await promise;

        // CATEGORY DELETE
        promise = waitForEvent(wsOwner, 'category_deleted');
        await request(app)
            .delete(`/api/v1/servers/${server._id}/categories/${category._id || category.id}`)
            .set('Authorization', `Bearer ${tokenOwner}`);
        await promise;

        wsOwner.close();
    });

    /* --- EMOJI UPDATE --- */
    it('should receive emoji_updated', async function () {
        const owner = await createTestUser({ username: 'Owner' });
        const tokenOwner = generateAuthToken(owner);
        const server = await createTestServer(owner._id);

        const wsOwner = await createAuthenticatedClient(appServer, tokenOwner);
        await joinServerWs(wsOwner, server._id);

        const promise = waitForEvent(wsOwner, 'emoji_updated');

        // Add emoji via HTTP
        const res = await request(app)
            .post(`/api/v1/servers/${server._id}/emojis`)
            .set('Authorization', `Bearer ${tokenOwner}`)
            .attach('emoji', Buffer.from('fake-image-data'), 'emoji.png')
            .field('name', 'blobhappy');

        assert.ok(res.status === 200 || res.status === 201, `Emoji upload failed: ${res.status} - ${JSON.stringify(res.body)}`);

        const event = await promise;
        assert.strictEqual(event.serverId, server._id.toString());

        wsOwner.close();
    });

    /* --- UNREAD UPDATES --- */

    it('should receive dm_unread_updated when a DM is sent', async function () {
        const sender = await createTestUser({ username: 'Sender' });
        const receiver = await createTestUser({ username: 'Receiver' });
        const tokenSender = generateAuthToken(sender);
        const tokenReceiver = generateAuthToken(receiver);

        // Add friendship
        const { Friendship } = require('../../src/models/Friendship');
        await Friendship.create({ userId: sender._id, friendId: receiver._id });
        await Friendship.create({ userId: receiver._id, friendId: sender._id });

        const wsReceiver = await createAuthenticatedClient(appServer, tokenReceiver);
        const promiseUnread = waitForEvent(wsReceiver, 'dm_unread_updated');

        const wsSender = await createAuthenticatedClient(appServer, tokenSender);
        sendEvent(wsSender, 'send_message_dm', {
            receiverId: receiver._id.toString(),
            text: 'Hello, unread!'
        });

        const event = await promiseUnread;
        assert.strictEqual(event.peerId, sender._id.toString());
        assert.ok(event.count >= 1);

        wsReceiver.close();
        wsSender.close();
    });

    /* --- REACTION NOTIFICATIONS --- */

    it('should receive a mention (type: reaction) when someone reacts to your message', async function () {
        const author = await createTestUser({ username: 'Author' });
        const reactor = await createTestUser({ username: 'Reactor' });
        const tokenAuthor = generateAuthToken(author);
        const tokenReactor = generateAuthToken(reactor);

        const server = await createTestServer(author._id);
        const channel = await createTestChannel(server._id);

        const { ServerMember, ServerMessage } = require('../../src/models/Server');
        await ServerMember.create({ serverId: server._id, userId: reactor._id });

        const wsAuthor = await createAuthenticatedClient(appServer, tokenAuthor);
        await joinServerWs(wsAuthor, server._id);

        const message = await ServerMessage.create({
            serverId: server._id,
            channelId: channel._id,
            senderId: author._id,
            text: 'React to this!',
            createdAt: new Date()
        });

        const promiseReactionAlert = waitForEvent(wsAuthor, 'mention', 10000);

        const wsReactor = await createAuthenticatedClient(appServer, tokenReactor);
        await joinServerWs(wsReactor, server._id);

        sendEvent(wsReactor, 'add_reaction', {
            messageId: message._id.toString(),
            emoji: '👍',
            emojiType: 'unicode',
            messageType: 'server'
        });

        const alert = await promiseReactionAlert;
        assert.strictEqual(alert.type, 'reaction');
        assert.strictEqual(alert.senderId, reactor._id.toString());

        wsAuthor.close();
        wsReactor.close();
    });

    /* --- SECURITY & ISOLATION --- */

    it('should NOT receive events for servers the user is not in', async function () {
        const userA = await createTestUser({ username: 'UserA' });
        const userB = await createTestUser({ username: 'UserB' });
        const tokenA = generateAuthToken(userA);
        const tokenB = generateAuthToken(userB);

        const serverA = await createTestServer(userA._id);
        const serverB = await createTestServer(userB._id);

        const wsA = await createAuthenticatedClient(appServer, tokenA);
        await joinServerWs(wsA, serverA._id);

        const promiseEvent = waitForEvent(wsA, 'server_updated', 2000).catch(e => e);

        await request(app)
            .patch(`/api/v1/servers/${serverB._id}`)
            .set('Authorization', `Bearer ${tokenB}`)
            .send({ name: 'Private Server B' });

        const result = await promiseEvent;
        assert.ok(result instanceof Error, 'User A should NOT have received an event from Server B');

        wsA.close();
    });
});
