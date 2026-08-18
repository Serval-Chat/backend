import express from 'express';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';

import { JWT_SECRET } from '@/config/env';
import { resolveSession } from '@/utils/sessionAuth';
import {
    passwordResetConfirmLimiter,
    sensitiveOperationLimiter,
    twoFactorVerifyLimiter,
} from '../rateLimiting';

jest.mock('@/utils/sessionAuth', () => ({
    resolveSession: jest.fn(),
}));

const mockResolveSession = resolveSession as jest.Mock;

mockResolveSession.mockImplementation((token: string) =>
    Promise.resolve(
        token.startsWith('token-for-')
            ? { userId: token.slice('token-for-'.length), sessionId: 'session' }
            : null,
    ),
);

function appWith(path: string, middleware: express.RequestHandler) {
    const app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    app.use(path, middleware);
    app.all(/.*/, (_req, res) => {
        res.status(401).send('nope');
    });
    return app;
}

function accessToken(id: string): string {
    return jwt.sign(
        { id, login: id, username: id, type: 'access' },
        JWT_SECRET,
        { algorithm: 'HS256' },
    );
}

function tempToken(id: string): string {
    return jwt.sign(
        { id, login: id, type: '2fa_temp', scope: 'auth:2fa:verify' },
        JWT_SECRET,
        { algorithm: 'HS256' },
    );
}

describe('sensitiveOperationLimiter', () => {
    it('keys on the bearer token rather than the address', async () => {
        const app = appWith('/password', sensitiveOperationLimiter);

        const send = (id: string, forwardedFor: string) =>
            request(app)
                .patch('/password')
                .set('Authorization', `Bearer token-for-${id}`)
                .set('X-Forwarded-For', forwardedFor)
                .send({});

        for (let i = 0; i < 3; i++) {
            expect((await send('user-a', `203.0.113.${i}`)).status).toBe(401);
        }
        expect((await send('user-a', '203.0.113.99')).status).toBe(429);

        expect((await send('user-b', '203.0.113.0')).status).toBe(401);
    });
});

describe('twoFactorVerifyLimiter', () => {
    it('keys on the account inside the temp token', async () => {
        const app = appWith('/2fa/verify', twoFactorVerifyLimiter);

        const guess = (id: string, forwardedFor: string) =>
            request(app)
                .post('/2fa/verify')
                .set('X-Forwarded-For', forwardedFor)
                .send({ tempToken: tempToken(id), code: '000000' });

        for (let i = 0; i < 10; i++) {
            expect((await guess('victim', `198.51.100.${i}`)).status).toBe(401);
        }
        expect((await guess('victim', '198.51.100.200')).status).toBe(429);

        expect((await guess('someone-else', '198.51.100.0')).status).toBe(401);
    });

    it('falls back to the address when no usable temp token is present', async () => {
        const app = appWith('/2fa/verify', twoFactorVerifyLimiter);

        const send = (body: Record<string, unknown>) =>
            request(app)
                .post('/2fa/verify')
                .set('X-Forwarded-For', '198.51.100.55')
                .send(body);

        for (let i = 0; i < 10; i++) {
            expect(
                (await send(i % 2 === 0 ? {} : { tempToken: accessToken('u') }))
                    .status,
            ).toBe(401);
        }
        expect((await send({})).status).toBe(429);
    });
});

describe('passwordResetConfirmLimiter', () => {
    it('bounds the bcrypt work per address, whatever token is submitted', async () => {
        const app = appWith(
            '/password/reset/confirm',
            passwordResetConfirmLimiter,
        );

        const send = (token: string) =>
            request(app)
                .post('/password/reset/confirm')
                .set('X-Forwarded-For', '203.0.113.77')
                .send({ token, newPassword: 'x' });

        for (let i = 0; i < 10; i++) {
            expect(
                (await send('a'.repeat(64 - String(i).length) + i)).status,
            ).toBe(401);
        }
        expect((await send('b'.repeat(64))).status).toBe(429);
    });
});
