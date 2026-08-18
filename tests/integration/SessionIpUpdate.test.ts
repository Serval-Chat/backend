import request from 'supertest';
import { setup, teardown } from './setup';
import { createTestUser, generateAuthToken } from './helpers';
import type { IUser } from '../../src/models/User';
import type { Express } from 'express';

describe('PATCH /api/v1/auth/sessions/:sessionId/ip (dev-only)', () => {
    let app: Express;
    let user: IUser;
    let token: string;
    let sessionId: string;

    beforeAll(async () => {
        const result = await setup();
        app = result.app;

        user = await createTestUser({
            login: `session-ip-${Date.now()}@example.com`,
        });
        token = await generateAuthToken(user);

        const listRes = await request(app)
            .get('/api/v1/auth/sessions')
            .set('Authorization', `Bearer ${token}`);
        sessionId = listRes.body.sessions[0].id;
    });

    afterAll(async () => {
        await teardown();
    });

    it('rejects an unauthenticated request', async () => {
        const res = await request(app)
            .patch(`/api/v1/auth/sessions/${sessionId}/ip`)
            .send({ ip: '203.0.113.5' });
        expect(res.status).toBe(401);
    });

    it('rejects a malformed ip with 400', async () => {
        const res = await request(app)
            .patch(`/api/v1/auth/sessions/${sessionId}/ip`)
            .set('Authorization', `Bearer ${token}`)
            .send({ ip: 'not-an-ip' });
        expect(res.status).toBe(400);
    });

    it('404s for a session that does not belong to the caller', async () => {
        const otherUser = await createTestUser({
            login: `session-ip-other-${Date.now()}@example.com`,
        });
        const otherToken = await generateAuthToken(otherUser);

        const res = await request(app)
            .patch(`/api/v1/auth/sessions/${sessionId}/ip`)
            .set('Authorization', `Bearer ${otherToken}`)
            .send({ ip: '203.0.113.5' });
        expect(res.status).toBe(404);
    });

    it('updates the ip of a session the caller owns and it is reflected in the session list', async () => {
        const res = await request(app)
            .patch(`/api/v1/auth/sessions/${sessionId}/ip`)
            .set('Authorization', `Bearer ${token}`)
            .send({ ip: '203.0.113.5' });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            message: 'Session IP updated',
            ip: '203.0.113.5',
        });

        const listRes = await request(app)
            .get('/api/v1/auth/sessions')
            .set('Authorization', `Bearer ${token}`);
        const updated = listRes.body.sessions.find(
            (s: { id: string }) => s.id === sessionId,
        );
        expect(updated.ip).toBe('203.0.113.5');
    });

    it('accepts a valid IPv6 address', async () => {
        const res = await request(app)
            .patch(`/api/v1/auth/sessions/${sessionId}/ip`)
            .set('Authorization', `Bearer ${token}`)
            .send({ ip: '2001:db8::1' });
        expect(res.status).toBe(200);
        expect(res.body.ip).toBe('2001:db8::1');
    });
});
