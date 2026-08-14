import type { IncomingMessage } from 'node:http';

export function forwardedHops(trustProxy: boolean | number | string): number {
    if (typeof trustProxy === 'number') return trustProxy;
    if (trustProxy === true) return Number.POSITIVE_INFINITY;
    return 0;
}

export function sourceAddress(
    request: IncomingMessage,
    trustProxy: boolean | number | string,
): string {
    const direct = request.socket.remoteAddress ?? '';
    const hops = forwardedHops(trustProxy);
    if (hops <= 0) return normalise(direct);

    const header = request.headers['x-forwarded-for'];
    const raw = Array.isArray(header) ? header.join(',') : (header ?? '');
    const chain = raw
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '');

    if (chain.length === 0) return normalise(direct);

    const index = chain.length - Math.min(hops, chain.length);
    return normalise(chain[index] ?? direct);
}

function normalise(address: string): string {
    const trimmed = address
        .replace(/^::ffff:/, '')
        .trim()
        .toLowerCase();
    return trimmed === '' ? 'unknown' : trimmed;
}
