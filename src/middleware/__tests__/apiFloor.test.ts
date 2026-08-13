import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { JWT_SECRET } from '@/config/env';
import { createApp } from '@/server';
import {
    API_FLOOR_MAX,
    API_FLOOR_WINDOW_MS,
    apiFloorLimiter,
    loginLimiter,
} from '../rateLimiting';

interface MiddlewareStack {
    _router?: { stack: StackLayer[] };
    router?: { stack: StackLayer[] };
}

interface StackLayer {
    handle: unknown;
    name: string;
    matchers?: ((input: string) => unknown)[];
}

function token(id: string): string {
    return jwt.sign(
        {
            id,
            login: `${id}@example.invalid`,
            username: id,
            tokenVersion: 0,
            type: 'access',
        },
        JWT_SECRET,
        { expiresIn: '1h' },
    );
}

function appWithFloor() {
    const app = express();
    app.set('trust proxy', false);
    app.use(express.json());
    app.use('/api', apiFloorLimiter);
    app.all(/.*/, (_req, res) => {
        res.status(200).send('ok');
    });
    return app;
}

async function drain(
    app: express.Express,
    path: string,
    headers: Record<string, string>,
    count: number,
) {
    let lastStatus = 0;
    for (let i = 0; i < count; i++) {
        const res = await request(app).get(path).set(headers);
        lastStatus = res.status;
    }
    return lastStatus;
}

describe('the API floor limiter', () => {
    it('is generous enough for a page load but caps sustained hammering', () => {
        expect(API_FLOOR_WINDOW_MS).toBe(60_000);
        expect(API_FLOOR_MAX).toBe(600);
        expect(API_FLOOR_MAX / (API_FLOOR_WINDOW_MS / 1000)).toBe(10);
    });

    it('returns 429 once a caller exceeds the budget', async () => {
        const app = appWithFloor();
        const headers = { Authorization: `Bearer ${token('floor-user-a')}` };

        expect(
            await drain(app, '/api/v1/servers', headers, API_FLOOR_MAX),
        ).toBe(200);

        const over = await request(app).get('/api/v1/servers').set(headers);
        expect(over.status).toBe(429);
    }, 30_000);

    it('gives each authenticated user their own budget on a shared address', async () => {
        const app = appWithFloor();
        const a = { Authorization: `Bearer ${token('floor-user-b')}` };
        const b = { Authorization: `Bearer ${token('floor-user-c')}` };

        await drain(app, '/api/v1/servers', a, API_FLOOR_MAX);
        expect((await request(app).get('/api/v1/servers').set(a)).status).toBe(
            429,
        );
        expect((await request(app).get('/api/v1/servers').set(b)).status).toBe(
            200,
        );
    }, 30_000);

    it('does not limit paths outside /api', async () => {
        const app = appWithFloor();
        const headers = { Authorization: `Bearer ${token('floor-user-d')}` };

        await drain(app, '/api/v1/servers', headers, API_FLOOR_MAX);
        expect(
            (await request(app).get('/api/v1/servers').set(headers)).status,
        ).toBe(429);
        expect(
            (await request(app).get('/uploads/photo.png').set(headers)).status,
        ).toBe(200);
    }, 30_000);

    it('leaves the tighter named limiters in charge of their own routes', async () => {
        const app = express();
        app.set('trust proxy', false);
        app.use(express.json());
        app.use('/api', apiFloorLimiter);
        app.use('/api/v1/auth/login', loginLimiter);
        app.all(/.*/, (_req, res) => {
            res.status(200).send('ok');
        });

        let status = 0;
        for (let i = 0; i < 6; i++) {
            const res = await request(app)
                .post('/api/v1/auth/login')
                .send({ login: 'floor@example.invalid' });
            status = res.status;
        }

        expect(status).toBe(429);
    });
});

describe('the floor is mounted on the real application', () => {
    it('sits in front of /api and nothing else', () => {
        const app = createApp() as MiddlewareStack;
        const stack = (app._router ?? app.router)?.stack ?? [];
        const mounted = stack.filter(
            (layer) => layer.handle === apiFloorLimiter,
        );

        expect(mounted).toHaveLength(1);

        const matchers = (mounted[0] as StackLayer).matchers ?? [];
        const matches = (path: string) =>
            matchers.some((match) => match(path) !== false);

        expect(matches('/api')).toBe(true);
        expect(matches('/api/v1/servers')).toBe(true);
        expect(matches('/uploads/photo.png')).toBe(false);
        expect(matches('/metrics')).toBe(false);
    });

    it('runs before the route table', () => {
        const app = createApp() as MiddlewareStack;
        const stack = (app._router ?? app.router)?.stack ?? [];
        const floorAt = stack.findIndex((l) => l.handle === apiFloorLimiter);
        const routerAt = stack.findIndex(
            (l, i) => i > floorAt && l.name === 'router',
        );

        expect(floorAt).toBeGreaterThan(-1);
        expect(routerAt).toBeGreaterThan(floorAt);
    });
});
