import request from 'supertest';
import { setup, teardown } from './setup';
import { createTestUser, generateAuthToken } from './helpers';
import { User } from '../../src/models/User';
import type { IUser } from '../../src/models/User';
import type { Express } from 'express';

describe('Profile serverSettings privacy', () => {
    let app: Express;
    let owner: IUser;
    let ownerToken: string;
    let viewer: IUser;
    let viewerToken: string;

    beforeAll(async () => {
        const result = await setup();
        app = result.app;

        owner = await createTestUser({
            login: `settings-owner-${Date.now()}@example.com`,
        });
        ownerToken = generateAuthToken(owner);

        await User.updateOne(
            { snowflakeId: owner.snowflakeId },
            {
                $set: {
                    serverSettings: {
                        order: ['My Secret Folder', owner.snowflakeId],
                    },
                },
            },
        );

        viewer = await createTestUser({
            login: `settings-viewer-${Date.now()}@example.com`,
        });
        viewerToken = generateAuthToken(viewer);
    });

    afterAll(async () => {
        await teardown();
    });

    it('never exposes serverSettings when another user views the profile', async () => {
        const res = await request(app)
            .get(`/api/v1/profile/${owner.snowflakeId}`)
            .set('Authorization', `Bearer ${viewerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.serverSettings).toBeUndefined();
    });

    it('still returns serverSettings on the owner\'s own /profile/me', async () => {
        const res = await request(app)
            .get('/api/v1/profile/me')
            .set('Authorization', `Bearer ${ownerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.serverSettings).toBeDefined();
        expect(res.body.serverSettings.order).toContain('My Secret Folder');
    });

    it('still returns serverSettings when the owner views their own profile by id', async () => {
        const res = await request(app)
            .get(`/api/v1/profile/${owner.snowflakeId}`)
            .set('Authorization', `Bearer ${ownerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.serverSettings).toBeDefined();
        expect(res.body.serverSettings.order).toContain('My Secret Folder');
    });
});
