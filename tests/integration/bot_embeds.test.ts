import request from 'supertest';

import { ServerMember } from '../../src/models/Server';
import { Message } from '../../src/models/Message';
import { setup, teardown } from './setup';
import {
    clearDatabase,
    createTestChannel,
    createTestServer,
    createTestUser,
    generateAuthToken,
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
        ownerToken = await generateAuthToken(owner);

        botUser = await createTestUser({
            login: 'bot_embed',
            username: 'bot_embed',
            isBot: true,
        });
        botToken = await generateAuthToken(botUser);

        serverDoc = await createTestServer(owner.snowflakeId);
        channelDoc = await createTestChannel(serverDoc.snowflakeId);
        await ServerMember.create({
            serverId: serverDoc.snowflakeId,
            userId: botUser.snowflakeId,
            roles: [],
        });
    });

    it('rejects embeds for non-bot users', async () => {
        const res = await request(app)
            .post(
                `/api/v1/servers/${serverDoc.snowflakeId}/channels/${channelDoc.snowflakeId}/messages`,
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
                `/api/v1/servers/${serverDoc.snowflakeId}/channels/${channelDoc.snowflakeId}/messages`,
            )
            .set('Authorization', `Bearer ${botToken}`)
            .send({ embeds });

        expect(sendRes.status).toBe(201);
        expect(sendRes.body.text).toBe('');
        expect(sendRes.body.embeds).toEqual(embeds);

        const saved = await Message.findOne({
            snowflakeId: sendRes.body.id,
        }).lean();
        expect(saved?.embeds).toEqual(embeds);
    });
});
