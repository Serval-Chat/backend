import request from 'supertest';

import { Ping } from '../../src/models/Ping';
import type { IUser } from '../../src/models/User';
import { createTestUser, generateAuthToken } from './helpers';
import { setup, teardown } from './setup';
import type { Express } from 'express';

const SERVER_ID = '0314440862954160128';
const CHANNEL_A = '0314447146336124928';
const CHANNEL_B = '0314447146336124929';

let messageCounter = 0;
const nextMessageId = (): string => {
    messageCounter += 1;
    return `0362009044010926${String(messageCounter).padStart(4, '0')}`;
};

describe('Pings REST API', () => {
    let app: Express;
    let alice: IUser;
    let bob: IUser;
    let aliceToken: string;
    let bobToken: string;

    beforeAll(async () => {
        const result = await setup();
        app = result.app;
        alice = await createTestUser({
            login: `ping-alice-${Date.now()}@example.com`,
        });
        bob = await createTestUser({
            login: `ping-bob-${Date.now()}@example.com`,
        });
        aliceToken = await generateAuthToken(alice);
        bobToken = await generateAuthToken(bob);
    });

    afterAll(async () => {
        await teardown();
    });

    afterEach(async () => {
        await Ping.deleteMany({});
    });

    const seedServerPing = async (
        owner: IUser,
        channel: string,
    ): Promise<{ id: string; messageId: string }> => {
        const messageId = nextMessageId();
        const ping = await Ping.create({
            userId: owner.snowflakeId,
            type: 'mention',
            sender: 'cat',
            senderId: bob.snowflakeId,
            serverId: SERVER_ID,
            channelId: channel,
            messageId,
            message: {
                messageId,
                text: `ping ${messageId}`,
                createdAt: new Date().toISOString(),
            },
            timestamp: new Date(Date.now() - 60_000),
        });
        return { id: ping.snowflakeId, messageId };
    };

    it('rejects unauthenticated requests on every ping route', async () => {
        await request(app).get('/api/v1/pings').expect(401);
        await request(app)
            .delete('/api/v1/pings/0362009044010926080')
            .expect(401);
        await request(app)
            .delete(`/api/v1/pings/channel/${CHANNEL_A}`)
            .expect(401);
    });

    it('returns an empty list for a user with no pings', async () => {
        const res = await request(app)
            .get('/api/v1/pings')
            .set('Authorization', `Bearer ${aliceToken}`)
            .expect(200);

        expect(res.body).toEqual({ pings: [] });
    });

    it('returns only the requesting user pings with the documented notification shape', async () => {
        const mine = await seedServerPing(alice, CHANNEL_A);
        await seedServerPing(bob, CHANNEL_B);

        const res = await request(app)
            .get('/api/v1/pings')
            .set('Authorization', `Bearer ${aliceToken}`)
            .expect(200);

        expect(res.body.pings).toHaveLength(1);
        const ping = res.body.pings[0];
        expect(ping.id).toMatch(/^\d{19}$/);
        expect(ping.id).toBe(mine.id);
        expect(ping.type).toBe('mention');
        expect(ping.sender).toBe('cat');
        expect(ping.senderId).toBe(bob.snowflakeId);
        expect(ping.serverId).toBe(SERVER_ID);
        expect(ping.channelId).toBe(CHANNEL_A);
        expect(ping.message.messageId).toBe(mine.messageId);
        expect(ping.message.text).toBe(`ping ${mine.messageId}`);
        expect(typeof ping.timestamp).toBe('number');
    });

    it('deletes an own ping and stops returning it', async () => {
        const own = await seedServerPing(alice, CHANNEL_A);

        const del = await request(app)
            .delete(`/api/v1/pings/${own.id}`)
            .set('Authorization', `Bearer ${aliceToken}`)
            .expect(200);
        expect(del.body).toEqual({ success: true });

        expect(await Ping.countDocuments({})).toBe(0);
        const res = await request(app)
            .get('/api/v1/pings')
            .set('Authorization', `Bearer ${aliceToken}`)
            .expect(200);
        expect(res.body.pings).toEqual([]);
    });

    it('reports false when deleting a ping that does not exist', async () => {
        const res = await request(app)
            .delete('/api/v1/pings/0362009044010926999')
            .set('Authorization', `Bearer ${aliceToken}`)
            .expect(200);
        expect(res.body).toEqual({ success: false });
    });

    it('refuses to delete a ping owned by another user (xcut-28)', async () => {
        const foreign = await seedServerPing(bob, CHANNEL_A);

        const del = await request(app)
            .delete(`/api/v1/pings/${foreign.id}`)
            .set('Authorization', `Bearer ${aliceToken}`)
            .expect(200);
        expect(del.body).toEqual({ success: false });

        expect(await Ping.countDocuments({})).toBe(1);
        const ownerRes = await request(app)
            .get('/api/v1/pings')
            .set('Authorization', `Bearer ${bobToken}`)
            .expect(200);
        expect(ownerRes.body.pings).toHaveLength(1);
        expect(ownerRes.body.pings[0].id).toBe(foreign.id);
    });

    it('clears every ping in a channel for the requesting user only', async () => {
        const mineA1 = await seedServerPing(alice, CHANNEL_A);
        const mineA2 = await seedServerPing(alice, CHANNEL_A);
        await seedServerPing(alice, CHANNEL_B);
        const foreignA = await seedServerPing(bob, CHANNEL_A);

        const del = await request(app)
            .delete(`/api/v1/pings/channel/${CHANNEL_A}`)
            .set('Authorization', `Bearer ${aliceToken}`)
            .expect(200);
        expect(del.body).toEqual({ success: true, clearedCount: 2 });

        const remaining = await Ping.find({}).lean();
        expect(remaining).toHaveLength(2);
        const remainingIds = remaining.map((p): string => p.snowflakeId);
        expect(remainingIds).not.toContain(mineA1.id);
        expect(remainingIds).not.toContain(mineA2.id);
        expect(remainingIds).toContain(foreignA.id);
    });
});
