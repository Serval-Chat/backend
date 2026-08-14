import type { IncomingMessage } from 'node:http';

import { forwardedHops, sourceAddress } from '../upgradeSource';

function req(
    remoteAddress: string,
    forwarded?: string | string[],
): IncomingMessage {
    return {
        socket: { remoteAddress },
        headers:
            forwarded === undefined ? {} : { 'x-forwarded-for': forwarded },
    } as unknown as IncomingMessage;
}

describe('forwardedHops', () => {
    it('matches how Express reads TRUST_PROXY', () => {
        expect(forwardedHops(false)).toBe(0);
        expect(forwardedHops(1)).toBe(1);
        expect(forwardedHops(2)).toBe(2);
        expect(forwardedHops(true)).toBe(Number.POSITIVE_INFINITY);
    });
});

describe('sourceAddress', () => {
    it('ignores a forwarded chain when the proxy is not trusted', () => {
        expect(sourceAddress(req('10.0.0.1', '1.2.3.4, 5.6.7.8'), false)).toBe(
            '10.0.0.1',
        );
    });

    it('cannot be spoofed by a client adding hops', () => {
        const spoofed = 'evil-1, evil-2, evil-3, 203.0.113.9';
        expect(sourceAddress(req('10.0.0.1', spoofed), 1)).toBe('203.0.113.9');
    });

    it('counts hops from the right, like Express', () => {
        const chain = 'client, cloudflare, nginx';
        expect(sourceAddress(req('10.0.0.1', chain), 1)).toBe('nginx');
        expect(sourceAddress(req('10.0.0.1', chain), 2)).toBe('cloudflare');
        expect(sourceAddress(req('10.0.0.1', chain), 3)).toBe('client');
    });

    it('falls back to the socket when the chain is shorter than the hop count', () => {
        expect(sourceAddress(req('10.0.0.1', '1.2.3.4'), 5)).toBe('1.2.3.4');
        expect(sourceAddress(req('10.0.0.1', ''), 2)).toBe('10.0.0.1');
        expect(sourceAddress(req('10.0.0.1'), 2)).toBe('10.0.0.1');
    });

    it('normalises the IPv4-mapped form so one client is one bucket', () => {
        expect(sourceAddress(req('::ffff:203.0.113.9'), false)).toBe(
            '203.0.113.9',
        );
        expect(sourceAddress(req('::ffff:203.0.113.9', '203.0.113.9'), 1)).toBe(
            sourceAddress(req('203.0.113.9'), false),
        );
    });

    it('joins a repeated header rather than dropping entries', () => {
        expect(sourceAddress(req('10.0.0.1', ['a, b', 'c']), 1)).toBe('c');
    });

    it('never returns an empty bucket key', () => {
        expect(sourceAddress(req('', undefined), false)).toBe('unknown');
        expect(sourceAddress(req('10.0.0.1', ' , , '), 1)).toBe('10.0.0.1');
    });
});
