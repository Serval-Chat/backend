import request from 'supertest';
import { setup, teardown } from './setup';
import {
    createTestUser,
    generateAuthToken,
    createTestServer,
    createTestChannel,
} from './helpers';
import { ServerMessage, Role, ServerMember } from '../../src/models/Server';
import type { IServer, IChannel } from '../../src/models/Server';
import { Message } from '../../src/models/Message';
import type { IUser } from '../../src/models/User';
import type { Express } from 'express';

describe('Reply to a deleted message', () => {
    let app: Express;

    beforeAll(async () => {
        const result = await setup();
        app = result.app;
    });

    afterAll(async () => {
        await teardown();
    });

    describe('Direct Messages', () => {
        let userA: IUser;
        let userAToken: string;
        let userB: IUser;
        let userBToken: string;

        beforeEach(async () => {
            await Message.deleteMany({});

            userA = await createTestUser({
                login: `dm-a-${Date.now()}@example.com`,
            });
            userAToken = generateAuthToken(userA);
            userB = await createTestUser({
                login: `dm-b-${Date.now()}@example.com`,
            });
            userBToken = generateAuthToken(userB);

            const { Friendship } = await import('../../src/models/Friendship');
            await Friendship.create({
                user: userA.username,
                friend: userB.username,
                userId: userA.snowflakeId,
                friendId: userB.snowflakeId,
            });
        });

        it('hides message A and reports it deleted, while message B (which replied to it) survives with no reply target', async () => {
            const messageA = await Message.create({
                senderId: userA.snowflakeId,
                receiverId: userB.snowflakeId,
                text: 'Original DM message',
            });

            const messageB = await Message.create({
                senderId: userB.snowflakeId,
                receiverId: userA.snowflakeId,
                text: 'Replying to A',
                replyToId: messageA.snowflakeId,
            });

            const deleteRes = await request(app)
                .delete(`/api/v1/messages/${messageA.snowflakeId}`)
                .set('Authorization', `Bearer ${userAToken}`);
            expect(deleteRes.status).toBe(200);

            // Message A is hidden/gone for anyone trying to fetch it directly.
            const getARes = await request(app)
                .get(`/api/v1/messages/${userB.snowflakeId}/${messageA.snowflakeId}`)
                .set('Authorization', `Bearer ${userBToken}`);
            expect(getARes.status).toBe(404);

            // DM deletes are hard deletes: the document is gone entirely.
            const dbMessageA = await Message.findOne({
                snowflakeId: messageA.snowflakeId,
            });
            expect(dbMessageA).toBeNull();

            // Message B still exists, and the API no longer reports a reply target for it.
            const getBRes = await request(app)
                .get(`/api/v1/messages/${userA.snowflakeId}/${messageB.snowflakeId}`)
                .set('Authorization', `Bearer ${userBToken}`);
            expect(getBRes.status).toBe(200);
            expect(getBRes.body.message.id).toBe(messageB.snowflakeId);
            expect(getBRes.body.repliedMessage).toBeNull();
        });
    });

    describe('Server Channel Messages', () => {
        let serverOwner: IUser;
        let regularUser: IUser;
        let regularUserToken: string;
        let auditUser: IUser;
        let auditToken: string;
        let testServer: IServer;
        let testChannel: IChannel;

        beforeEach(async () => {
            await ServerMessage.deleteMany({});

            serverOwner = await createTestUser({
                login: `owner-${Date.now()}@example.com`,
            });
            testServer = await createTestServer(serverOwner.snowflakeId);
            testChannel = await createTestChannel(testServer.snowflakeId);

            regularUser = await createTestUser({
                login: `regular-${Date.now()}@example.com`,
            });
            regularUserToken = generateAuthToken(regularUser);
            await ServerMember.create({
                serverId: testServer.snowflakeId,
                userId: regularUser.snowflakeId,
                roles: [],
            });

            auditUser = await createTestUser({
                login: `audit-${Date.now()}@example.com`,
            });
            auditToken = generateAuthToken(auditUser);
            const auditRole = await Role.create({
                serverId: testServer.snowflakeId,
                name: 'Auditor',
                position: 1,
                permissions: { viewChannels: true, seeDeletedMessages: true },
            });
            await ServerMember.create({
                serverId: testServer.snowflakeId,
                userId: auditUser.snowflakeId,
                roles: [auditRole.snowflakeId],
            });
        });

        it('hides message A and reports it deleted, while message B (which replied to it) survives with no reply target', async () => {
            const sendARes = await request(app)
                .post(
                    `/api/v1/servers/${testServer.snowflakeId}/channels/${testChannel.snowflakeId}/messages`,
                )
                .set('Authorization', `Bearer ${regularUserToken}`)
                .send({ text: 'Original channel message' });
            expect(sendARes.status).toBe(201);
            const messageAId = sendARes.body.id as string;

            const sendBRes = await request(app)
                .post(
                    `/api/v1/servers/${testServer.snowflakeId}/channels/${testChannel.snowflakeId}/messages`,
                )
                .set('Authorization', `Bearer ${regularUserToken}`)
                .send({ text: 'Replying to A', replyToId: messageAId });
            expect(sendBRes.status).toBe(201);
            const messageBId = sendBRes.body.id as string;

            const deleteRes = await request(app)
                .delete(
                    `/api/v1/servers/${testServer.snowflakeId}/channels/${testChannel.snowflakeId}/messages/${messageAId}`,
                )
                .set('Authorization', `Bearer ${regularUserToken}`);
            expect(deleteRes.status).toBe(200);

            // Hidden from a regular viewer without seeDeletedMessages.
            const getARes = await request(app)
                .get(
                    `/api/v1/servers/${testServer.snowflakeId}/channels/${testChannel.snowflakeId}/messages/${messageAId}`,
                )
                .set('Authorization', `Bearer ${regularUserToken}`);
            expect(getARes.status).toBe(404);

            // Channel deletes are soft deletes: the record survives with deletedAt set.
            const dbMessageA = await ServerMessage.findOne({
                snowflakeId: messageAId,
            });
            expect(dbMessageA).not.toBeNull();
            expect(dbMessageA?.deletedAt).toBeDefined();

            // Message B still exists, and a regular viewer no longer sees A as its reply target.
            const getBRes = await request(app)
                .get(
                    `/api/v1/servers/${testServer.snowflakeId}/channels/${testChannel.snowflakeId}/messages/${messageBId}`,
                )
                .set('Authorization', `Bearer ${regularUserToken}`);
            expect(getBRes.status).toBe(200);
            expect(getBRes.body.message.id).toBe(messageBId);
            expect(getBRes.body.repliedMessage).toBeNull();

            // A privileged viewer (seeDeletedMessages) can still see A's content via B's reply reference.
            const getBAuditRes = await request(app)
                .get(
                    `/api/v1/servers/${testServer.snowflakeId}/channels/${testChannel.snowflakeId}/messages/${messageBId}`,
                )
                .set('Authorization', `Bearer ${auditToken}`);
            expect(getBAuditRes.status).toBe(200);
            expect(getBAuditRes.body.repliedMessage?.id).toBe(messageAId);
            expect(getBAuditRes.body.repliedMessage?.deletedAt).toBeDefined();
        });
    });
});
