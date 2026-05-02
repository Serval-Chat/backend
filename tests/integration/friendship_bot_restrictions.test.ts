import request from 'supertest';

import { setup, teardown } from './setup';
import { clearDatabase, createTestUser, generateAuthToken } from './helpers';
import { FriendRequest } from '../../src/models/Friendship';

import type { Express } from 'express';
import type { IUser } from '../../src/models/User';

describe('Friendship bot restrictions', () => {
    let app: Express;
    let human: IUser;
    let humanToken: string;
    let botUser: IUser;
    let otherHuman: IUser;

    beforeAll(async () => {
        const result = await setup();
        app = result.app;
    });

    afterAll(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await clearDatabase();
        human = await createTestUser({
            login: 'human_sender',
            username: 'human_sender',
        });
        botUser = await createTestUser({
            login: 'friend_bot',
            username: 'friend_bot',
            isBot: true,
        });
        otherHuman = await createTestUser({
            login: 'human_target',
            username: 'human_target',
        });
        humanToken = generateAuthToken(human);
    });

    it('rejects sending a friend request to a bot', async () => {
        const res = await request(app)
            .post('/api/v1/friends')
            .set('Authorization', `Bearer ${humanToken}`)
            .send({ username: botUser.username });

        expect(res.status).toBe(400);
        expect(JSON.stringify(res.body)).toContain('Cannot add bots as friends');

        const requestDoc = await FriendRequest.findOne({
            fromId: human._id,
            toId: botUser._id,
        });
        expect(requestDoc).toBeNull();
    });

    it('still allows sending friend requests to non-bot users', async () => {
        const res = await request(app)
            .post('/api/v1/friends')
            .set('Authorization', `Bearer ${humanToken}`)
            .send({ username: otherHuman.username });

        expect(res.status).toBe(201);
        expect(res.body.message).toBe('friend request sent');

        const requestDoc = await FriendRequest.findOne({
            fromId: human._id,
            toId: otherHuman._id,
        });
        expect(requestDoc).toBeTruthy();
    });
});
