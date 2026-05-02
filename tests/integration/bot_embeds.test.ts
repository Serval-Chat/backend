import jwt from 'jsonwebtoken';
import request from 'supertest';

import { JWT_SECRET } from '../../src/config/env';
import { ServerMember, ServerMessage } from '../../src/models/Server';
import { setup, teardown } from './setup';
import {
    clearDatabase,
    createTestChannel,
    createTestServer,
    createTestUser,
} from './helpers';

import type { Express } from 'express';
import type { IUser } from '../../src/models/User';
import type { IServer, IChannel } from '../../src/models/Server';

describe('Bot embed messaging', () => {
    let app: Express;
    let owner: IUser;
    let ownerToken: string;
    let botUser: IUser;
    let botToken: string;
    let serverDoc: IServer;
    let channelDoc: IChannel;

    beforeAll(async () => {
        const result = await setup();
        app = result.app;
    });

    afterAll(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await clearDatabase();

        owner = await createTestUser({
            login: 'owner_embed',
            username: 'owner_embed',
        });
        ownerToken = jwt.sign(
            {
                id: owner._id.toString(),
                login: owner.login,
                username: owner.username,
                tokenVersion: owner.tokenVersion,
                isBot: false,
                type: 'access',
            },
            JWT_SECRET,
            { expiresIn: '1h' },
        );

        botUser = await createTestUser({
            login: 'bot_embed',
            username: 'bot_embed',
            isBot: true,
        });
        botToken = jwt.sign(
            {
                id: botUser._id.toString(),
                login: botUser.login,
                username: botUser.username,
                tokenVersion: botUser.tokenVersion,
                isBot: true,
                type: 'access',
            },
            JWT_SECRET,
            { expiresIn: '1h' },
        );

        serverDoc = await createTestServer(owner._id.toString());
        channelDoc = await createTestChannel(serverDoc._id.toString());
        await ServerMember.create({
            serverId: serverDoc._id,
            userId: botUser._id,
            roles: [],
        });
    });

    it('rejects embeds for non-bot users', async () => {
        const res = await request(app)
            .post(
                `/api/v1/servers/${serverDoc._id.toString()}/channels/${channelDoc._id.toString()}/messages`,
            )
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({
                embeds: [{ title: 'Not Allowed' }],
            });

        expect(res.status).toBe(403);
        expect(JSON.stringify(res.body)).toContain(
            'Only bots can send messages with rich embeds',
        );
    });

    it('allows bot embed-only messages and persists embeds', async () => {
        const embeds = [
            {
                title: 'Status',
                description: 'Everything green',
                color: 0x00ff00,
            },
        ];
        const sendRes = await request(app)
            .post(
                `/api/v1/servers/${serverDoc._id.toString()}/channels/${channelDoc._id.toString()}/messages`,
            )
            .set('Authorization', `Bearer ${botToken}`)
            .send({ embeds });

        expect(sendRes.status).toBe(201);
        expect(sendRes.body.text).toBe('');
        expect(sendRes.body.embeds).toEqual(embeds);

        const saved = await ServerMessage.findById(sendRes.body._id).lean();
        expect(saved?.embeds).toEqual(embeds);
    });
});
