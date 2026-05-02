import request from 'supertest';
import { setup, teardown } from './setup';
import { 
    createTestUser, 
    generateAuthToken, 
    createTestServer, 
    createTestChannel, 
    createTestMessage 
} from './helpers';
import { ServerMember } from '../../src/models/Server';

import type { Express } from 'express';
import type { IUser } from '../../src/models/User';
import type { IServer, IChannel } from '../../src/models/Server';

describe('Timeout Enforcement Integration', () => {
    let app: Express;
    let serverObj: IServer;
    let channelObj: IChannel;
    let owner: IUser;
    let targetUser: IUser;
    let ownerToken: string;
    let targetToken: string;

    beforeAll(async () => {
        const result = await setup();
        app = result.app;
    });

    afterAll(async () => {
        await teardown();
    });

    beforeEach(async () => {
        owner = await createTestUser({ login: `owner_${Date.now()}@test.com` });
        targetUser = await createTestUser({ login: `target_${Date.now()}@test.com` });

        ownerToken = generateAuthToken(owner);
        targetToken = generateAuthToken(targetUser);

        serverObj = await createTestServer(owner._id.toString());
        channelObj = await createTestChannel(serverObj._id.toString());

        await ServerMember.create({
            serverId: serverObj._id,
            userId: targetUser._id,
            roles: []
        });
    });

    const timeoutUser = async (durationMinutes: number) => {
        const until = new Date(Date.now() + durationMinutes * 60 * 1000);
        await ServerMember.updateOne(
            { serverId: serverObj._id, userId: targetUser._id },
            { $set: { communicationDisabledUntil: until } }
        );
    };

    it('should prevent timed-out user from sending messages', async () => {
        await timeoutUser(10);

        const response = await request(app)
            .post(`/api/v1/servers/${serverObj._id}/channels/${channelObj._id}/messages`)
            .set('Authorization', `Bearer ${targetToken}`)
            .send({ content: 'Hello' });

        expect(response.status).toBe(403);
        expect(response.body.message).toContain('timed out');
    });

    it('should prevent timed-out user from adding reactions', async () => {
        const message = await createTestMessage(serverObj._id.toString(), channelObj._id.toString(), owner._id.toString());
        await timeoutUser(10);

        const response = await request(app)
            .post(`/api/v1/servers/${serverObj._id}/channels/${channelObj._id}/messages/${message._id}/reactions`)
            .set('Authorization', `Bearer ${targetToken}`)
            .send({ emoji: '👍', emojiType: 'unicode' });

        expect(response.status).toBe(403);
    });

    it('should prevent timed-out user from editing their own messages', async () => {
        const message = await createTestMessage(serverObj._id.toString(), channelObj._id.toString(), targetUser._id.toString());
        await timeoutUser(10);

        const response = await request(app)
            .patch(`/api/v1/servers/${serverObj._id}/channels/${channelObj._id}/messages/${message._id}`)
            .set('Authorization', `Bearer ${targetToken}`)
            .send({ content: 'Edited message' });

        expect(response.status).toBe(403);
        expect(response.body.message).toContain('timed out');
    });

    it('should prevent timed-out user from deleting their own messages', async () => {
        const message = await createTestMessage(serverObj._id.toString(), channelObj._id.toString(), targetUser._id.toString());
        await timeoutUser(10);

        const response = await request(app)
            .delete(`/api/v1/servers/${serverObj._id}/channels/${channelObj._id}/messages/${message._id}`)
            .set('Authorization', `Bearer ${targetToken}`);

        expect(response.status).toBe(403);
        expect(response.body.message).toContain('timed out');
    });

    it('should allow owner to send messages even if timed out (owner immunity)', async () => {
        const until = new Date(Date.now() + 10 * 60 * 1000);
        await ServerMember.updateOne(
            { serverId: serverObj._id, userId: owner._id },
            { $set: { communicationDisabledUntil: until } }
        );

        const response = await request(app)
            .post(`/api/v1/servers/${serverObj._id}/channels/${channelObj._id}/messages`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ content: 'Owner says hi' });

        expect(response.status).toBe(201);
    });

    it('should allow user to send messages after timeout expires', async () => {
        const until = new Date(Date.now() - 1000);
        await ServerMember.updateOne(
            { serverId: serverObj._id, userId: targetUser._id },
            { $set: { communicationDisabledUntil: until } }
        );

        const response = await request(app)
            .post(`/api/v1/servers/${serverObj._id}/channels/${channelObj._id}/messages`)
            .set('Authorization', `Bearer ${targetToken}`)
            .send({ content: 'I am back' });

        expect(response.status).toBe(201);
    });
});
