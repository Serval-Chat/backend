import express from 'express';
import request from 'supertest';

import { resolveTrustProxy } from '@/server';
import { loginLimiter } from '../rateLimiting';

describe('resolveTrustProxy', () => {
    it.each([
        [undefined, false],
        ['', false],
        ['false', false],
        ['true', true],
        ['1', 1],
        ['2', 2],
        ['loopback', 'loopback'],
        ['10.0.0.0/8', '10.0.0.0/8'],
    ])('resolves %p to %p', (value, expected) => {
        expect(resolveTrustProxy(value)).toBe(expected);
    });

    it('does not trust the forwarded chain when unset', () => {
        expect(resolveTrustProxy(undefined)).not.toBe(true);
    });
});

describe('IP-keyed limits under the resolved setting', () => {
    function appWith(trustProxy: boolean | number | string) {
        const app = express();
        app.set('trust proxy', trustProxy);
        app.use(express.json());
        app.use('/login', loginLimiter);
        app.all(/.*/, (_req, res) => {
            res.status(200).send('ok');
        });
        return app;
    }

    async function attempt(app: express.Express, forwardedFor: string) {
        return request(app)
            .post('/login')
            .set('X-Forwarded-For', forwardedFor)
            .send({ login: 'victim@example.invalid' });
    }

    it('limits a spoofed X-Forwarded-For when trust proxy is the default', async () => {
        const app = appWith(resolveTrustProxy(undefined));

        const codes: number[] = [];
        for (let i = 0; i < 7; i++) {
            codes.push((await attempt(app, `203.0.113.${i}`)).status);
        }

        expect(codes.slice(0, 5)).toEqual(Array(5).fill(200));
        expect(codes.slice(5)).toEqual([429, 429]);
    });

    it('still separates real clients behind one proxy hop', async () => {
        const app = appWith(resolveTrustProxy('1'));

        for (let i = 0; i < 5; i++) {
            expect((await attempt(app, '198.51.100.7')).status).toBe(200);
        }
        expect((await attempt(app, '198.51.100.7')).status).toBe(429);
        expect((await attempt(app, '198.51.100.8')).status).toBe(200);
    });
});
