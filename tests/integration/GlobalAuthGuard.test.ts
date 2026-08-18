import request from 'supertest';
import { setup, teardown } from './setup';
import { createTestUser, generateAuthToken } from './helpers';
import type { IUser } from '../../src/models/User';
import type { Express } from 'express';

const FAKE_SNOWFLAKE = '0000000000000000001';
const FAKE_WEBHOOK_TOKEN = 'a'.repeat(128);
const FAKE_HEX32 = 'a'.repeat(32);

describe('JwtAuthGuard registered as APP_GUARD (xcut-04)', () => {
    let app: Express;
    let user: IUser;
    let token: string;

    beforeAll(async () => {
        const result = await setup();
        app = result.app;

        user = await createTestUser({
            login: `global-guard-${Date.now()}@example.com`,
        });
        token = await generateAuthToken(user);
    });

    afterAll(async () => {
        await teardown();
    });

    describe('protected routes still reject an unauthenticated request', () => {
        it('rejects GET /api/v1/profile/me with no token', async () => {
            const res = await request(app).get('/api/v1/profile/me');
            expect(res.status).toBe(401);
        });

        it('accepts GET /api/v1/profile/me with a valid token', async () => {
            const res = await request(app)
                .get('/api/v1/profile/me')
                .set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(200);
        });

        it('now defaults to guarded: GET /api/v1/emojis/:emojiId with no token', async () => {
            const res = await request(app).get(
                `/api/v1/emojis/${FAKE_SNOWFLAKE}`,
            );
            expect(res.status).toBe(401);
        });

        it('now defaults to guarded: GET /api/v1/stickers/:stickerId with no token', async () => {
            const res = await request(app).get(
                `/api/v1/stickers/${FAKE_SNOWFLAKE}`,
            );
            expect(res.status).toBe(401);
        });
    });

    describe('routes marked @Public() remain reachable with no token', () => {
        const cases: Array<{
            name: string;
            request: () => request.Test;
            expectedStatus: number;
        }> = [
            {
                name: 'POST /api/v1/auth/login (validation reached, not the guard)',
                request: () => request(app).post('/api/v1/auth/login').send({}),
                expectedStatus: 400,
            },
            {
                name: 'POST /api/v1/auth/2fa/verify',
                request: () =>
                    request(app).post('/api/v1/auth/2fa/verify').send({}),
                expectedStatus: 400,
            },
            {
                name: 'POST /api/v1/auth/register',
                request: () =>
                    request(app).post('/api/v1/auth/register').send({}),
                expectedStatus: 400,
            },
            {
                name: 'POST /api/v1/auth/password/reset',
                request: () =>
                    request(app).post('/api/v1/auth/password/reset').send({}),
                expectedStatus: 400,
            },
            {
                name: 'POST /api/v1/auth/password/reset/confirm',
                request: () =>
                    request(app)
                        .post('/api/v1/auth/password/reset/confirm')
                        .send({}),
                expectedStatus: 400,
            },
            {
                name: 'GET /api/v1/bots/:clientId/public',
                request: () => request(app).get(`/api/v1/bots/${FAKE_HEX32}/public`),
                expectedStatus: 404,
            },
            {
                name: 'GET /api/v1/decorations/file/:id',
                request: () =>
                    request(app).get(`/api/v1/decorations/file/${FAKE_SNOWFLAKE}`),
                expectedStatus: 404,
            },
            {
                name: 'GET /api/v1/embed/proxy-image (missing file param)',
                request: () => request(app).get('/api/v1/embed/proxy-image'),
                expectedStatus: 400,
            },
            {
                name: 'GET /api/v1/embed/proxy (missing url param)',
                request: () => request(app).get('/api/v1/embed/proxy'),
                expectedStatus: 400,
            },
            {
                name: 'GET /api/v1/download/:filename (legacy compatibility route)',
                request: () => request(app).get('/api/v1/download/nonexistent.png'),
                expectedStatus: 404,
            },
            {
                name: 'GET /api/v1/exports/download/:token',
                request: () =>
                    request(app).get('/api/v1/exports/download/nonexistent-token'),
                expectedStatus: 404,
            },
            {
                name: 'GET /api/v1/files/metadata/:filename',
                request: () =>
                    request(app).get('/api/v1/files/metadata/nonexistent.png'),
                expectedStatus: 404,
            },
            {
                name: 'GET /api/v1/files/download/:filename',
                request: () =>
                    request(app).get('/api/v1/files/download/nonexistent.png'),
                expectedStatus: 404,
            },
            {
                name: 'GET /api/v1/notification-sounds/play/:filename',
                request: () =>
                    request(app).get(
                        '/api/v1/notification-sounds/play/nonexistent.ogg',
                    ),
                expectedStatus: 404,
            },
            {
                name: 'GET /api/v1/profile/banner/:filename',
                request: () =>
                    request(app).get('/api/v1/profile/banner/nonexistent.png'),
                expectedStatus: 404,
            },
            {
                name: 'GET /api/v1/profile/picture/:filename',
                request: () =>
                    request(app).get('/api/v1/profile/picture/nonexistent.png'),
                expectedStatus: 404,
            },
            {
                name: 'GET /api/v1/invites/:code',
                request: () => request(app).get('/api/v1/invites/nonexistent-code'),
                expectedStatus: 404,
            },
            {
                name: 'GET /api/v1/servers/icon/:filename',
                request: () =>
                    request(app).get('/api/v1/servers/icon/nonexistent.png'),
                expectedStatus: 404,
            },
            {
                name: 'GET /api/v1/servers/banner/:filename',
                request: () =>
                    request(app).get('/api/v1/servers/banner/nonexistent.png'),
                expectedStatus: 404,
            },
            {
                name: 'GET /api/v1/servers/:serverId/roles/icon/:filename',
                request: () =>
                    request(app).get(
                        `/api/v1/servers/${FAKE_SNOWFLAKE}/roles/icon/nonexistent.png`,
                    ),
                expectedStatus: 404,
            },
            {
                name: 'GET /api/v1/system/info',
                request: () => request(app).get('/api/v1/system/info'),
                expectedStatus: 200,
            },
            {
                name: 'GET /api/v1/webhooks/avatar/:filename',
                request: () =>
                    request(app).get('/api/v1/webhooks/avatar/nonexistent.png'),
                expectedStatus: 404,
            },
            {
                name: 'POST /api/v1/webhooks/:token (execute)',
                request: () =>
                    request(app)
                        .post(`/api/v1/webhooks/${FAKE_WEBHOOK_TOKEN}`)
                        .send({ content: 'hi' }),
                expectedStatus: 404,
            },
            {
                name: 'PATCH /api/v1/webhooks/:token/messages/:messageId (edit)',
                request: () =>
                    request(app)
                        .patch(
                            `/api/v1/webhooks/${FAKE_WEBHOOK_TOKEN}/messages/${FAKE_SNOWFLAKE}`,
                        )
                        .send({ content: 'hi' }),
                expectedStatus: 404,
            },
            {
                name: 'DELETE /api/v1/webhooks/:token/messages/:messageId (delete)',
                request: () =>
                    request(app).delete(
                        `/api/v1/webhooks/${FAKE_WEBHOOK_TOKEN}/messages/${FAKE_SNOWFLAKE}`,
                    ),
                expectedStatus: 404,
            },
        ];

        it.each(cases)('$name is not blocked by the guard', async (c) => {
            const res = await c.request();
            expect(res.status).not.toBe(401);
            expect(res.status).toBe(c.expectedStatus);
        });
    });
});
