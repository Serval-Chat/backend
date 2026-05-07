import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import ipaddr from 'ipaddr.js';
import { Agent } from 'undici';
import net from 'node:net';
import tls from 'node:tls';
import { ErrorMessages } from '@/constants/errorMessages';
import logger from '@/utils/logger';

const MAX_REDIRECTS = 3;

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

const BLOCKED_HOSTNAME_SUFFIXES = new Set(['.local', '.internal', '.lan']);

const DISALLOWED_RANGES = new Set([
    'loopback',
    'linkLocal',
    'private',
    'uniqueLocal',
    'broadcast',
    'carrierGradeNat',
    'unspecified',
    'reserved',
    'multicast',
]);

type HeaderRecord = Record<string, string>;

const ALLOWED_HEADERS = new Set([
    'content-type',
    'content-length',
    'content-disposition',
    'last-modified',
    'etag',
    'cache-control',
]);

function normalizeHostname(hostname: string): string {
    return hostname.trim().toLowerCase().replace(/\.$/, '');
}

export function getCacheKey(url: string): string {
    return crypto.createHash('sha256').update(url).digest('hex');
}

export function sanitizeHeaders(headers: Headers): HeaderRecord {
    const result: HeaderRecord = {};
    headers.forEach((value, key) => {
        const lower = key.toLowerCase();
        if (ALLOWED_HEADERS.has(lower) && value !== '') {
            if (!(lower in result)) result[lower] = value;
        }
    });
    return result;
}

export function extractUrl(rawUrl: unknown): string {
    if (typeof rawUrl === 'string') return rawUrl;
    if (Array.isArray(rawUrl)) {
        const first = rawUrl[0];
        if (typeof first === 'string') return first;
    }
    throw new Error(ErrorMessages.FILE.URL_REQUIRED);
}

export function validateUrl(rawUrl: unknown): URL {
    const normalized = extractUrl(rawUrl);
    let target: URL;
    try {
        target = new URL(normalized);
    } catch {
        throw new Error(ErrorMessages.FILE.INVALID_URL);
    }

    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
        throw new Error(ErrorMessages.FILE.ONLY_HTTP_HTTPS);
    }

    if (target.hostname === '') {
        throw new Error(ErrorMessages.FILE.HOSTNAME_REQUIRED);
    }

    target.hostname = normalizeHostname(target.hostname);
    return target;
}

export function isBlockedHostname(hostname: string): boolean {
    const h = normalizeHostname(hostname);
    if (BLOCKED_HOSTNAMES.has(h)) return true;
    for (const suf of BLOCKED_HOSTNAME_SUFFIXES) {
        if (h.endsWith(suf)) return true;
    }
    return false;
}

export function isDisallowedAddress(address: string): boolean {
    try {
        const parsed = ipaddr.parse(address);
        let normalized: ipaddr.IPv4 | ipaddr.IPv6 = parsed;

        if (parsed.kind() === 'ipv6') {
            const ipv6 = parsed as ipaddr.IPv6;
            if (ipv6.isIPv4MappedAddress()) normalized = ipv6.toIPv4Address();
        }

        const range = normalized.range();
        return DISALLOWED_RANGES.has(range);
    } catch {
        return true;
    }
}

export async function resolveAndCheck(hostname: string) {
    try {
        const records = await dns.lookup(hostname, {
            all: true,
            verbatim: true,
        });
        if (records.length === 0) throw new Error('no records');

        for (const rec of records) {
            if (isDisallowedAddress(rec.address)) {
                throw new Error(ErrorMessages.FILE.DISALLOWED_ADDRESS);
            }
        }

        return records.map((r) => r.address);
    } catch (err) {
        if (
            err instanceof Error &&
            err.message === ErrorMessages.FILE.DISALLOWED_ADDRESS
        ) {
            throw err;
        }
        logger.error('Failed to resolve hostname:', err);
        throw new Error(
            `${ErrorMessages.FILE.FAILED_RESOLVE_HOSTNAME}: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
}

export async function ensureUrlAllowed(url: URL): Promise<void> {
    const hostname = normalizeHostname(url.hostname);

    if (isBlockedHostname(hostname))
        throw new Error(ErrorMessages.FILE.HOST_NOT_ALLOWED);

    if (ipaddr.isValid(hostname)) {
        if (isDisallowedAddress(hostname))
            throw new Error(ErrorMessages.FILE.DISALLOWED_ADDRESS);
        return;
    }

    await resolveAndCheck(hostname);
}

const proxyAgent = new Agent({
    connect(opts, cb) {
        if (opts.host === undefined) {
            return cb(new Error('Missing host'), null);
        }
        resolveAndCheck(opts.host)
            .then((ips) => {
                const port = opts.port
                    ? Number(opts.port)
                    : opts.protocol === 'https:'
                      ? 443
                      : 80;

                let currentIpIndex = 0;

                function attempt() {
                    const ip = ips[currentIpIndex];
                    const socket =
                        opts.protocol === 'https:'
                            ? tls.connect({
                                  host: ip,
                                  servername: opts.host,
                                  port,
                              })
                            : net.connect({ host: ip, port });

                    const errorHandler = (err: Error) => {
                        socket.destroy();
                        currentIpIndex++;
                        if (currentIpIndex >= ips.length) {
                            cb(err, null);
                        } else {
                            attempt();
                        }
                    };

                    socket.once('error', errorHandler);

                    const connectEvent =
                        opts.protocol === 'https:'
                            ? 'secureConnect'
                            : 'connect';
                    socket.once(connectEvent, () => {
                        socket.removeListener('error', errorHandler);
                        cb(null, socket);
                    });
                }

                attempt();
            })
            .catch((err) => cb(err, null));
    },
});

export async function fetchWithRedirects(
    url: URL,
    init: RequestInit = {},
): Promise<Response> {
    let currentUrl = new URL(url.toString());
    let redirects = 0;

    await ensureUrlAllowed(currentUrl);

    for (;;) {
        const ac = new AbortController();
        const timeoutId = setTimeout(() => ac.abort(), 10000);

        try {
            const fetchOptions: RequestInit & { dispatcher: Agent } = {
                ...init,
                headers: {
                    ...init.headers,
                    'User-Agent': 'Serchat/0.7.5',
                },
                redirect: 'manual',
                dispatcher: proxyAgent,
                signal: ac.signal as unknown as AbortSignal,
            };

            const response = await fetch(currentUrl, fetchOptions);

            const location = response.headers.get('location');
            if (
                location !== null &&
                response.status >= 300 &&
                response.status < 400
            ) {
                redirects += 1;
                if (redirects > MAX_REDIRECTS)
                    throw new Error(ErrorMessages.FILE.TOO_MANY_REDIRECTS);

                const nextUrl = new URL(location, currentUrl);
                nextUrl.hostname = normalizeHostname(nextUrl.hostname);
                await ensureUrlAllowed(nextUrl);

                currentUrl = nextUrl;
                continue;
            }

            return response;
        } finally {
            clearTimeout(timeoutId);
        }
    }
}

export async function readBodyWithLimit(
    stream: WebReadableStream<Uint8Array> | null,
    maxBytes: number,
): Promise<Buffer> {
    if (stream === null) return Buffer.alloc(0);

    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done === true) break;

            total += value.length;
            if (total > maxBytes) {
                await reader.cancel();
                throw new Error(ErrorMessages.FILE.SIZE_EXCEEDS_LIMIT);
            }

            chunks.push(value);
        }
    } finally {
        try {
            await reader.cancel();
        } catch {}
    }

    if (chunks.length === 0) return Buffer.alloc(0);
    return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}
