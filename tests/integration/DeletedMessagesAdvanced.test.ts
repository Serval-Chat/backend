import request from 'supertest';
import { setup, teardown } from './setup';
import { createTestUser, generateAuthToken, createTestServer, createTestChannel } from './helpers';
import { ServerMessage, Role, ServerMember } from '../../src/models/Server';
import type { IServer, IChannel } from '../../src/models/Server';
import { Message } from '../../src/models/Message';
import { AuditLog } from '../../src/models/AuditLog';
import type { IUser } from '../../src/models/User';
import type { Express } from 'express';

describe('Deleted Message Visibility Advanced Integration', () => {
    let app: Express;
    let serverOwner: IUser;
    let serverOwnerToken: string;
    let adminUser: IUser;
    let adminToken: string;
    let auditUser: IUser;
    let auditToken: string;
    let regularUser: IUser;
    let regularUserToken: string;
    let testServer: IServer;
    let testChannel: IChannel;

    beforeAll(async () => {
        const result = await setup();
        app = result.app;

        serverOwner = await createTestUser({ login: 'owner@example.com' });
        serverOwnerToken = generateAuthToken(serverOwner);

        adminUser = await createTestUser({ login: 'admin@example.com' });
        adminToken = generateAuthToken(adminUser);

        auditUser = await createTestUser({ login: 'audit@example.com' });
        auditToken = generateAuthToken(auditUser);

        regularUser = await createTestUser({ login: 'regular@example.com' });
        regularUserToken = generateAuthToken(regularUser);
    });

    beforeEach(async () => {
        await ServerMessage.deleteMany({});
        await Message.deleteMany({});
        await AuditLog.deleteMany({});

        testServer = await createTestServer(serverOwner._id.toString());
        testChannel = await createTestChannel(testServer._id.toString());

        const adminRole = await Role.create({
            serverId: testServer._id,
            name: 'Admin',
            position: 2,
            permissions: { administrator: true }
        });

        const auditRole = await Role.create({
            serverId: testServer._id,
            name: 'Auditor',
            position: 1,
            permissions: {
                viewChannels: true,
                seeDeletedMessages: true,
                manageServer: true // To also test audit log access
            }
        });

        await ServerMember.create({
            serverId: testServer._id,
            userId: adminUser._id,
            roles: [adminRole._id]
        });
        await ServerMember.create({
            serverId: testServer._id,
            userId: auditUser._id,
            roles: [auditRole._id]
        });
        await ServerMember.create({
            serverId: testServer._id,
            userId: regularUser._id,
            roles: []
        });
    });

    afterAll(async () => {
        await teardown();
    });

    describe('Server Message Visibility', () => {
        let deletedMessageId: string;

        beforeEach(async () => {
            const sendRes = await request(app)
                .post(`/api/v1/servers/${testServer._id}/channels/${testChannel._id}/messages`)
                .set('Authorization', `Bearer ${regularUserToken}`)
                .send({ text: 'Sensitive message' });

            deletedMessageId = sendRes.body._id;

            await request(app)
                .delete(`/api/v1/servers/${testServer._id}/channels/${testChannel._id}/messages/${deletedMessageId}`)
                .set('Authorization', `Bearer ${regularUserToken}`);
        });

        it('should hide deleted message from regular users in single message retrieval', async () => {
            const res = await request(app)
                .get(`/api/v1/servers/${testServer._id}/channels/${testChannel._id}/messages/${deletedMessageId}`)
                .set('Authorization', `Bearer ${regularUserToken}`);

            expect(res.status).toBe(404);
        });

        it('should allow user with seeDeletedMessages to retrieve single deleted message', async () => {
            const res = await request(app)
                .get(`/api/v1/servers/${testServer._id}/channels/${testChannel._id}/messages/${deletedMessageId}`)
                .set('Authorization', `Bearer ${auditToken}`);

            expect(res.status).toBe(200);
            expect(res.body.message.deletedAt).toBeDefined();
        });

        it('should allow server owner to retrieve single deleted message', async () => {
            const res = await request(app)
                .get(`/api/v1/servers/${testServer._id}/channels/${testChannel._id}/messages/${deletedMessageId}`)
                .set('Authorization', `Bearer ${serverOwnerToken}`);

            expect(res.status).toBe(200);
            expect(res.body.message._id).toBe(deletedMessageId);
        });

        it('should allow administrator to retrieve single deleted message', async () => {
            const res = await request(app)
                .get(`/api/v1/servers/${testServer._id}/channels/${testChannel._id}/messages/${deletedMessageId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.message._id).toBe(deletedMessageId);
        });

        it('should hide soft-deleted pinned messages from regular users', async () => {

            await ServerMessage.updateOne({ _id: deletedMessageId }, { $set: { isPinned: true } });

            const res = await request(app)
                .get(`/api/v1/servers/${testServer._id}/channels/${testChannel._id}/messages/pins`)
                .set('Authorization', `Bearer ${regularUserToken}`);

            expect(res.status).toBe(200);
            expect(res.body.some((m: { _id: string }) => m._id === deletedMessageId)).toBe(false);
        });

        it('should show soft-deleted pinned messages to audit users', async () => {
            await ServerMessage.updateOne({ _id: deletedMessageId }, { $set: { isPinned: true } });

            const res = await request(app)
                .get(`/api/v1/servers/${testServer._id}/channels/${testChannel._id}/messages/pins`)
                .set('Authorization', `Bearer ${auditToken}`);

            expect(res.status).toBe(200);
            expect(res.body.some((m: { _id: string }) => m._id === deletedMessageId)).toBe(true);
        });
    });

    describe('Audit Logs and Privacy', () => {
        it('should show deleted message text in audit logs to users with manageServer permission', async () => {
            const text = 'Audit this message';
            const sendRes = await request(app)
                .post(`/api/v1/servers/${testServer._id}/channels/${testChannel._id}/messages`)
                .set('Authorization', `Bearer ${regularUserToken}`)
                .send({ text });

            const messageId = sendRes.body._id;

            await request(app)
                .delete(`/api/v1/servers/${testServer._id}/channels/${testChannel._id}/messages/${messageId}`)
                .set('Authorization', `Bearer ${regularUserToken}`);

            const auditRes = await request(app)
                .get(`/api/v1/servers/${testServer._id}/audit-log`)
                .set('Authorization', `Bearer ${auditToken}`);

            expect(auditRes.status).toBe(200);
            const deleteEntry = auditRes.body.entries.find((e: { action: string }) => e.action === 'delete_message');
            expect(deleteEntry).toBeDefined();
            expect(deleteEntry.metadata.messageText).toBe(text);
        });
    });

    describe('Blocked Actions on Deleted Messages', () => {
        let deletedMessageId: string;

        beforeEach(async () => {
            const sendRes = await request(app)
                .post(`/api/v1/servers/${testServer._id}/channels/${testChannel._id}/messages`)
                .set('Authorization', `Bearer ${regularUserToken}`)
                .send({ text: 'Fixed text' });

            deletedMessageId = sendRes.body._id;

            await request(app)
                .delete(`/api/v1/servers/${testServer._id}/channels/${testChannel._id}/messages/${deletedMessageId}`)
                .set('Authorization', `Bearer ${regularUserToken}`);
        });

        it('should prevent editing a deleted message', async () => {
            const res = await request(app)
                .patch(`/api/v1/servers/${testServer._id}/channels/${testChannel._id}/messages/${deletedMessageId}`)
                .set('Authorization', `Bearer ${regularUserToken}`)
                .send({ text: 'New text' });

            expect(res.status).toBe(400);
        });

        it('should prevent pinning a deleted message', async () => {
            const res = await request(app)
                .post(`/api/v1/servers/${testServer._id}/channels/${testChannel._id}/messages/${deletedMessageId}/pin`)
                .set('Authorization', `Bearer ${serverOwnerToken}`);

            expect(res.status).toBe(400);
        });

        it('should return 404 when trying to react to a deleted message', async () => {
            const res = await request(app)
                .post(`/api/v1/servers/${testServer._id}/channels/${testChannel._id}/messages/${deletedMessageId}/reactions`)
                .set('Authorization', `Bearer ${regularUserToken}`)
                .send({ emoji: '👍', emojiType: 'unicode' });

            expect(res.status).toBe(404);
        });
    });

    describe('Direct Messages Deletion', () => {
        it('should hard-delete DM messages so they are not found by anyone', async () => {
            const otherUser = await createTestUser({ login: 'other@example.com' });
            const otherToken = generateAuthToken(otherUser);

            const { Friendship } = await import('../../src/models/Friendship');
            await Friendship.create({
                user: regularUser.username,
                friend: otherUser.username,
                status: 'accepted'
            });

            const dmMsg = await Message.create({
                senderId: regularUser._id,
                receiverId: otherUser._id,
                text: 'Private message'
            });
            const dmId = dmMsg._id.toString();

            const deleteRes = await request(app)
                .delete(`/api/v1/messages/${dmId}`)
                .set('Authorization', `Bearer ${regularUserToken}`);

            expect(deleteRes.status).toBe(200);

            const getRes = await request(app)
                .get(`/api/v1/messages/${otherUser._id}/${dmId}`)
                .set('Authorization', `Bearer ${otherToken}`);

            expect(getRes.status).toBe(404);

            // Verify it's gone from DB
            const dbMsg = await Message.findById(dmId);
            expect(dbMsg).toBeNull();
        });
    });
});
