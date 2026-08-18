import request from 'supertest';
import { setup, teardown } from './setup';
import { createTestUser, generateAuthToken } from './helpers';
import type { IUser } from '../../src/models/User';
import type { Express } from 'express';

describe('POST /api/v1/auth/logout', () => {
    let app: Express;
    let user: IUser;

    beforeAll(async () => {
        const result = await setup();
        app = result.app;

        user = await createTestUser({
            login: `logout-${Date.now()}@example.com`,
        });
    });

    afterAll(async () => {
        await teardown();
    });

    it('rejects an unauthenticated request', async () => {
        const res = await request(app).post('/api/v1/auth/logout');
        expect(res.status).toBe(401);
    });

    it('revokes the calling session so the same token is rejected afterwards', async () => {
        const token = await generateAuthToken(user);

        const before = await request(app)
            .get('/api/v1/profile/me')
            .set('Authorization', `Bearer ${token}`);
        expect(before.status).toBe(200);

        const logoutRes = await request(app)
            .post('/api/v1/auth/logout')
            .set('Authorization', `Bearer ${token}`);
        expect(logoutRes.status).toBe(200);
        expect(logoutRes.body).toEqual({ message: 'Logged out successfully' });

        const after = await request(app)
            .get('/api/v1/profile/me')
            .set('Authorization', `Bearer ${token}`);
        expect(after.status).toBe(401);
    });

    it('does not disturb the other active sessions for the same user', async () => {
        const tokenA = await generateAuthToken(user);
        const tokenB = await generateAuthToken(user);

        const logoutRes = await request(app)
            .post('/api/v1/auth/logout')
            .set('Authorization', `Bearer ${tokenA}`);
        expect(logoutRes.status).toBe(200);

        const stillValid = await request(app)
            .get('/api/v1/profile/me')
            .set('Authorization', `Bearer ${tokenB}`);
        expect(stillValid.status).toBe(200);
    });
});
