import request from 'supertest';
import { setup, teardown } from './setup';
import { createTestUser, generateAuthToken } from './helpers';
import { User } from '../../src/models/User';
import type { IUser } from '../../src/models/User';
import type { Express } from 'express';

describe('Profile settings privacy', () => {
    let app: Express;
    let owner: IUser;
    let ownerToken: string;
    let viewer: IUser;
    let viewerToken: string;

    beforeAll(async () => {
        const result = await setup();
        app = result.app;

        owner = await createTestUser({
            login: `msg-settings-owner-${Date.now()}@example.com`,
        });
        ownerToken = generateAuthToken(owner);

        await User.updateOne(
            { snowflakeId: owner.snowflakeId },
            {
                $set: {
                    settings: {
                        muteNotifications: true,
                        ownMessageColor: '#ff00ff',
                        otherMessageColor: '#00ffff',
                    },
                },
            },
        );

        viewer = await createTestUser({
            login: `msg-settings-viewer-${Date.now()}@example.com`,
        });
        viewerToken = generateAuthToken(viewer);
    });

    afterAll(async () => {
        await teardown();
    });

    it('never exposes settings when another user views the profile', async () => {
        const res = await request(app)
            .get(`/api/v1/profile/${owner.snowflakeId}`)
            .set('Authorization', `Bearer ${viewerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.settings).toBeUndefined();
    });

    it('still returns settings on the owner\'s own /profile/me', async () => {
        const res = await request(app)
            .get('/api/v1/profile/me')
            .set('Authorization', `Bearer ${ownerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.settings).toBeDefined();
        expect(res.body.settings.ownMessageColor).toBe('#ff00ff');
    });
});
