import express from 'express';
import request from 'supertest';

import { botTokenLimiter, registrationLimiter } from '../rateLimiting';

function appWith(path: string, middleware: express.RequestHandler) {
    const app = express();
    app.set('trust proxy', false);
    app.use(express.json());
    app.use(path, middleware);
    app.all(/.*/, (_req, res) => {
        res.status(200).send('ok');
    });
    return app;
}

describe('registrationLimiter', () => {
    it('counts attempts across different logins from one address', async () => {
        const app = appWith('/api/v1/auth/register', registrationLimiter);
        const codes: number[] = [];

        for (let i = 0; i < 5; i++) {
            const res = await request(app)
                .post('/api/v1/auth/register')
                .send({
                    login: `probe${i}@example.invalid`,
                    inviteCode: `i${i}`,
                });
            codes.push(res.status);
        }

        expect(codes).toEqual([200, 200, 200, 429, 429]);
    });
});

describe('botTokenLimiter', () => {
    it('is keyed on the clientId route parameter', async () => {
        const app = appWith(
            '/api/v1/bots/:clientId/reset-token',
            botTokenLimiter,
        );

        const codes: number[] = [];
        for (let i = 0; i < 11; i++) {
            const res = await request(app).post(
                '/api/v1/bots/aaaaaaaa/reset-token',
            );
            codes.push(res.status);
        }

        expect(codes.slice(0, 10)).toEqual(Array(10).fill(200));
        expect(codes[10]).toBe(429);

        const other = await request(app).post(
            '/api/v1/bots/bbbbbbbb/reset-token',
        );
        expect(other.status).toBe(200);
    });

    it('applies to bot creation, which has no clientId', async () => {
        const app = appWith('/api/v1/bots', botTokenLimiter);

        const codes: number[] = [];
        for (let i = 0; i < 11; i++) {
            const res = await request(app).post('/api/v1/bots');
            codes.push(res.status);
        }

        expect(codes[10]).toBe(429);
    });
});
