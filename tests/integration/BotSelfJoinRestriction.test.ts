import request from 'supertest';
import { setup, teardown } from './setup';
import { createTestUser, generateAuthToken, createTestServer } from './helpers';
import { Bot, DEFAULT_BOT_PERMISSIONS } from '../../src/models/Bot';

import type { Express } from 'express';
import type { IUser } from '../../src/models/User';
import type { IServer } from '../../src/models/Server';

describe('Bot Self-Authorization Restriction', () => {
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

    it('should prevent a bot from authorizing itself to join a server', async () => {

        const botUser = await createTestUser({ username: 'self_joining_bot', isBot: true });
        const bot = await Bot.create({
            clientId: '1234567890abcdef1234567890abcdef',
            clientSecretHash: 'hash',
            userId: botUser._id,
            ownerId: owner._id,
            botPermissions: { ...DEFAULT_BOT_PERMISSIONS },
        });


        const botToken = generateAuthToken(botUser);


        const res = await request(app)
            .post(`/api/v1/bots/${bot.clientId}/authorize`)
            .set('Authorization', `Bearer ${botToken}`)
            .send({
                serverId: testServer._id.toString(),
            });


        expect(res.status).toBe(403);
        expect(res.body.message).toContain('Bots are not allowed to access this endpoint');
    });

    it('should allow a real user to authorize a bot to join a server', async () => {
        const botUser = await createTestUser({ username: 'legit_bot', isBot: true });
        const bot = await Bot.create({
            clientId: 'abcdef1234567890abcdef1234567890',
            clientSecretHash: 'hash',
            userId: botUser._id,
            ownerId: owner._id,
            botPermissions: { ...DEFAULT_BOT_PERMISSIONS },
        });

        const res = await request(app)
            .post(`/api/v1/bots/${bot.clientId}/authorize`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({
                serverId: testServer._id.toString(),
            });

        expect(res.status).toBe(200);
        expect(res.body.serverName).toBe(testServer.name);
    });
});
