import request from 'supertest';
import { setup, teardown } from './setup';
import { createTestUser, generateAuthToken, createTestServer } from './helpers';
import { Bot, DEFAULT_BOT_PERMISSIONS } from '../../src/models/Bot';
import { Role, ServerMember } from '../../src/models/Server';

import type { Express } from 'express';
import type { IUser } from '../../src/models/User';
import type { IServer } from '../../src/models/Server';

describe('Irrevocable Bot Roles Integration', () => {
    let app: Express;
    let owner: IUser;
    let ownerToken: string;
    let testServer: IServer;

    beforeAll(async () => {
        const result = await setup();
        app = result.app;

        owner = await createTestUser();
        ownerToken = generateAuthToken(owner);
        testServer = await createTestServer(owner._id.toString());
    });

    afterAll(async () => {
        await teardown();
    });

    it('should assign a managed role to a bot when it joins a server', async () => {
        const botUser = await createTestUser({ username: 'test_bot', isBot: true });
        const bot = await Bot.create({
            clientId: '0123456789abcdef0123456789abcdef',
            clientSecretHash: 'hash',
            userId: botUser._id,
            ownerId: owner._id,
            botPermissions: { ...DEFAULT_BOT_PERMISSIONS, joinServers: true },
        });

        const res = await request(app)
            .post(`/api/v1/bots/${bot.clientId}/authorize`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({
                serverId: testServer._id.toString(),
            });

        if (res.status !== 200) {
            console.error('Authorization failed:', res.body);
        }
        expect(res.status).toBe(200);

        const managedRole = await Role.findOne({
            serverId: testServer._id,
            managed: true,
            managedBotId: bot._id,
        });

        console.log('Created managed role:', managedRole?._id, 'for bot:', bot._id);

        expect(managedRole).toBeDefined();
        expect(managedRole).not.toBeNull();
        expect(managedRole?.name).toBe('test_bot');

        const member = await ServerMember.findOne({
            serverId: testServer._id,
            userId: botUser._id,
        });

        expect(member?.roles).toContainEqual(managedRole?._id);
    });

    it('should prevent deleting a managed role', async () => {
        const managedRole = await Role.findOne({ managed: true });
        expect(managedRole).toBeDefined();

        const res = await request(app)
            .delete(`/api/v1/servers/${testServer._id}/roles/${managedRole?._id}`)
            .set('Authorization', `Bearer ${ownerToken}`);

        expect(res.status).toBe(403);
        expect(res.body.message).toContain('Cannot delete a managed role');
    });

    it('should prevent removing a managed role from a member', async () => {
        const managedRole = await Role.findOne({ managed: true });
        const botUser = await Bot.findOne({ _id: managedRole?.managedBotId });
        const botUserId = botUser?.userId;

        const res = await request(app)
            .delete(`/api/v1/servers/${testServer._id}/members/${botUserId}/roles/${managedRole?._id}`)
            .set('Authorization', `Bearer ${ownerToken}`);

        expect(res.status).toBe(403);
        expect(res.body.message).toContain('Cannot remove a managed role from a member');
    });



    it('should delete the managed role when the bot is kicked from the server', async () => {
        await request(app)
            .post(`/api/v1/bots/0123456789abcdef0123456789abcdef/authorize`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({
                serverId: testServer._id.toString(),
            });

        const managedRole = await Role.findOne({ managed: true });
        const botUser = await Bot.findOne({ _id: managedRole?.managedBotId });
        const botUserId = botUser?.userId;

        const res = await request(app)
            .delete(`/api/v1/servers/${testServer._id}/members/${botUserId}`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ reason: 'Test kick' });

        expect(res.status).toBe(200);

        const deletedRole = await Role.findOne({ _id: managedRole?._id });
        expect(deletedRole).toBeNull();
    });
});
