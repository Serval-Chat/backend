import request from 'supertest';

import { createApp } from '@/server';

function scriptSrcFrom(header: string): string[] {
    const directive = header
        .split(';')
        .map((d) => d.trim())
        .find((d) => d.startsWith('script-src'));
    return directive?.split(/\s+/).slice(1) ?? [];
}

describe('script-src does not allowlist public package CDNs', () => {
    const app = createApp();

    it('carries no CDN host that serves arbitrary published packages', async () => {
        const res = await request(app).get('/');
        const csp = res.headers['content-security-policy'] as string;
        expect(csp).toBeDefined();

        const scriptSrc = scriptSrcFrom(csp);

        for (const host of [
            'https://cdn.jsdelivr.net',
            'https://cdnjs.cloudflare.com',
            'https://unpkg.com',
            'https://ajax.googleapis.com',
        ]) {
            expect(scriptSrc).not.toContain(host);
        }
    });

    it('still carries self and a per-request nonce', async () => {
        const first = await request(app).get('/');
        const second = await request(app).get('/');

        const nonceOf = (res: typeof first) =>
            scriptSrcFrom(
                res.headers['content-security-policy'] as string,
            ).find((token) => token.startsWith("'nonce-"));

        const nonceA = nonceOf(first);
        const nonceB = nonceOf(second);

        expect(
            scriptSrcFrom(first.headers['content-security-policy'] as string),
        ).toContain("'self'");
        expect(nonceA).toMatch(/^'nonce-[A-Za-z0-9+/=]+'$/);
        expect(nonceA).not.toBe(nonceB);
    });

    it('still allows the two operational hosts the app depends on', async () => {
        const res = await request(app).get('/');
        const scriptSrc = scriptSrcFrom(
            res.headers['content-security-policy'] as string,
        );

        expect(scriptSrc).toContain('https://static.cloudflareinsights.com');
        expect(scriptSrc).toContain('https://challenges.cloudflare.com');
    });
});
