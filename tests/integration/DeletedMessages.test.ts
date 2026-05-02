import request from 'supertest';
import { setup, teardown } from './setup';
import { createTestUser, generateAuthToken, createTestServer, createTestChannel } from './helpers';
import { ServerMessage, Role, ServerMember } from '../../src/models/Server';

import type { Express } from 'express';
import type { IUser } from '../../src/models/User';
import type { IServer, IChannel } from '../../src/models/Server';

describe('Deleted Message Visibility Integration', () => {
    let app: Express;
    let admin: IUser;
    let adminToken: string;
    let regularUser: IUser;
    let regularUserToken: string;
    let testServer: IServer;
    let testChannel: IChannel;

    beforeAll(async () => {
        const result = await setup();
        app = result.app;

        admin = await createTestUser();
        adminToken = generateAuthToken(admin);

        regularUser = await createTestUser();
        regularUserToken = generateAuthToken(regularUser);
    });

    beforeEach(async () => {
        testServer = await createTestServer(admin._id.toString());
        testChannel = await createTestChannel(testServer._id.toString());

        await ServerMember.create({
            serverId: testServer._id,
            userId: regularUser._id,
            roles: []
        });
    });

    afterAll(async () => {
        await teardown();
    });

    it('should allow a user with seeDeletedMessages permission to see soft-deleted messages', async () => {
        const sendRes = await request(app)
            .post(`/api/v1/servers/${testServer._id}/channels/${testChannel._id}/messages`)
            .set('Authorization', `Bearer ${regularUserToken}`)
            .send({
                text: 'This message will be deleted'
            });

        expect(sendRes.status).toBe(201);
        const messageId = sendRes.body._id;

        const deleteRes = await request(app)
            .delete(`/api/v1/servers/${testServer._id}/channels/${testChannel._id}/messages/${messageId}`)
            .set('Authorization', `Bearer ${regularUserToken}`);

        expect(deleteRes.status).toBe(200);

        const dbMessage = await ServerMessage.findById(messageId);
        expect(dbMessage).toBeDefined();
        expect(dbMessage?.deletedAt).toBeDefined();

        const fetchRegularRes = await request(app)
            .get(`/api/v1/servers/${testServer._id}/channels/${testChannel._id}/messages`)
            .set('Authorization', `Bearer ${regularUserToken}`);

        expect(fetchRegularRes.status).toBe(200);
        const regularMsgs = fetchRegularRes.body;
        expect(regularMsgs.some((m: { _id: string }) => m._id === messageId)).toBe(false);

        const fetchAdminRes = await request(app)
            .get(`/api/v1/servers/${testServer._id}/channels/${testChannel._id}/messages`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(fetchAdminRes.status).toBe(200);
        const adminMsgs = fetchAdminRes.body;
        const deletedMsg = adminMsgs.find((m: { _id: string, deletedAt?: string }) => m._id === messageId);
        expect(deletedMsg).toBeDefined();
        expect(deletedMsg.deletedAt).toBeDefined();
    });

    it('should show deleted messages to a role with seeDeletedMessages permission', async () => {
        const specialRole = await Role.create({
            serverId: testServer._id,
            name: 'Audit Role',
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
                seeDeletedMessages: true, // Special permission
                addReactions: true,
                viewChannels: true,
                connect: true
            }
        });

        await ServerMember.updateOne(
            { serverId: testServer._id, userId: regularUser._id },
            { $push: { roles: specialRole._id } }
        );

        const sendRes = await request(app)
            .post(`/api/v1/servers/${testServer._id}/channels/${testChannel._id}/messages`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                text: 'Admin secret'
            });
        
        const messageId = sendRes.body._id;

        await request(app)
            .delete(`/api/v1/servers/${testServer._id}/channels/${testChannel._id}/messages/${messageId}`)
            .set('Authorization', `Bearer ${adminToken}`);

        const fetchRes = await request(app)
            .get(`/api/v1/servers/${testServer._id}/channels/${testChannel._id}/messages`)
            .set('Authorization', `Bearer ${regularUserToken}`);

        expect(fetchRes.status).toBe(200);
        const msgs = fetchRes.body;
        expect(msgs.some((m: { _id: string }) => m._id === messageId)).toBe(true);
    });
});
