import express from 'express';
import request from 'supertest';

const store = new Map<string, string>();
const redisClient = {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
        return 'OK';
    }),
    del: jest.fn(async (key: string) => {
        store.delete(key);
        return 1;
    }),
};

jest.mock('@/di/container', () => ({
    container: { get: () => ({ getClient: () => redisClient }) },
}));

import {
    BACKOFF_FREE_ATTEMPTS,
    BACKOFF_MAX_MS,
    backoffFor,
    loginBackoff,
} from '../loginBackoff';

function appWith(
    handler: (req: express.Request, res: express.Response) => void,
) {
    const app = express();
    app.set('trust proxy', false);
    app.use(express.json());
    app.post('/login', loginBackoff, handler);
    return app;
}

const wrongPassword = (_req: express.Request, res: express.Response) => {
    res.status(401).json({ error: 'Invalid credentials' });
};
const rightPassword = (_req: express.Request, res: express.Response) => {
    res.status(200).json({ token: 'ok' });
};

async function attempt(app: express.Express, login: string) {
    return request(app).post('/login').send({ login, password: 'x' });
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('backoffFor', () => {
    it('lets the first attempts through with no delay', () => {
        for (let i = 1; i <= BACKOFF_FREE_ATTEMPTS; i++) {
            expect(backoffFor(i)).toBe(0);
        }
    });

    it('doubles from one second', () => {
        expect(backoffFor(3)).toBe(1_000);
        expect(backoffFor(4)).toBe(2_000);
        expect(backoffFor(5)).toBe(4_000);
        expect(backoffFor(6)).toBe(8_000);
    });

    it('caps so a source is never locked out forever', () => {
        expect(backoffFor(50)).toBe(BACKOFF_MAX_MS);
        expect(backoffFor(5000)).toBe(BACKOFF_MAX_MS);
    });
});

describe('login backoff', () => {
    beforeEach(() => {
        store.clear();
        jest.clearAllMocks();
    });

    it('does not delay the first failures', async () => {
        const app = appWith(wrongPassword);

        for (let i = 0; i < BACKOFF_FREE_ATTEMPTS; i++) {
            expect((await attempt(app, 'victim@example.invalid')).status).toBe(
                401,
            );
            await settle();
        }

        expect(store.size).toBe(1);
    });

    it('holds the source off once the delay starts', async () => {
        const app = appWith(wrongPassword);

        for (let i = 0; i < BACKOFF_FREE_ATTEMPTS + 1; i++) {
            await attempt(app, 'victim@example.invalid');
            await settle();
        }

        const handler = jest.fn(wrongPassword);
        const blocked = await request(appWith(handler))
            .post('/login')
            .send({ login: 'victim@example.invalid', password: 'x' });

        expect(blocked.status).toBe(401);
        expect(handler).not.toHaveBeenCalled();
    });

    it('answers a held-off attempt exactly like a wrong password', async () => {
        const app = appWith(wrongPassword);

        const first = await attempt(app, 'victim@example.invalid');
        await settle();
        for (let i = 0; i < 3; i++) {
            await attempt(app, 'victim@example.invalid');
            await settle();
        }
        const held = await attempt(app, 'victim@example.invalid');

        expect(held.status).toBe(first.status);
        expect(held.body).toEqual(first.body);
    });

    it('keeps separate state per login, so one account cannot be locked by another', async () => {
        const app = appWith(wrongPassword);

        for (let i = 0; i < 5; i++) {
            await attempt(app, 'victim@example.invalid');
            await settle();
        }

        const handler = jest.fn(rightPassword);
        const other = await request(appWith(handler))
            .post('/login')
            .send({ login: 'someone-else@example.invalid', password: 'x' });

        expect(other.status).toBe(200);
        expect(handler).toHaveBeenCalled();
    });

    it('clears the counter when the password is finally right', async () => {
        const failing = appWith(wrongPassword);
        await attempt(failing, 'victim@example.invalid');
        await settle();
        expect(store.size).toBe(1);

        const succeeding = appWith(rightPassword);
        await attempt(succeeding, 'victim@example.invalid');
        await settle();

        expect(store.size).toBe(0);
    });

    it('does not count a rate-limit or server response as a password failure', async () => {
        const app = appWith((_req, res) => {
            res.status(429).json({ error: 'slow down' });
        });

        await attempt(app, 'victim@example.invalid');
        await settle();

        expect(store.size).toBe(0);
    });
});
