import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import ipaddr from 'ipaddr.js';
import { ErrorMessages } from '@/constants/errorMessages';
import logger from '@/utils/logger';

const MAX_REDIRECTS = 3;

// Exact hostnames to block (normalized, without trailing dot)
const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

// Suffixes that should be considered internal/reserved for hostname checks
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

/**
 * Normalize a hostname: lowercase and strip trailing dot.
 * @param hostname - The hostname to normalize.
 * @returns The normalized hostname.
 */
function normalizeHostname(hostname: string): string {
    return hostname.trim().toLowerCase().replace(/\.$/, '');
}

/**
 * Generate SHA256 cache key from URL.
 * @param url - The URL to hash.
 * @returns The SHA256 hash of the URL.
 */
export function getCacheKey(url: string): string {
    return crypto.createHash('sha256').update(url).digest('hex');
}

/**
 * Prune expired entries from cache and enforce size limits.
 * Eviction strategy:
 * 1. Remove expired entries
 * 2. If still over limit, remove the entries with the smallest expiresAt values until <= maxEntries
 * @param map - The cache map to prune.
 * @param maxEntries - The maximum number of entries to keep.
 */
export function pruneCache<T extends { expiresAt: number }>(
    map: Map<string, T>,
    maxEntries: number,
): void {
    const now = Date.now();

    // Remove expired
    for (const [key, entry] of map) {
        if (entry.expiresAt <= now) {
            map.delete(key);
        }
    }

    if (map.size <= maxEntries) return;

    // Build an array of [key, expiresAt] sorted ascending by expiresAt
    const items = Array.from(map.entries()).map(([k, v]) => ({
        k,
        expiresAt: v.expiresAt,
    }));
    items.sort((a, b) => a.expiresAt - b.expiresAt);

    // Remove oldest-by-expiry until within limit
    let i = 0;
    while (map.size > maxEntries && i < items.length) {
        const item = items[i];
        if (item) {
            map.delete(item.k);
        }
        i += 1;
    }
}

/**
 * Sanitize HTTP headers to allowed list. Preserves the first seen value for each header.
 * @param headers - The Headers object to sanitize.
 * @returns A record of sanitized headers.
 */
export function sanitizeHeaders(headers: Headers): HeaderRecord {
    const result: HeaderRecord = {};
    // iterate over actual headers (handles multi-value ones too)
    headers.forEach((value, key) => {
        const lower = key.toLowerCase();
        if (ALLOWED_HEADERS.has(lower) && value) {
            // keep first occurrence
            if (!(lower in result)) result[lower] = value;
        }
    });
    return result;
}

/**
 * Extract URL string from request parameter (string or string[]).
 * @param rawUrl - The raw URL input.
 * @returns The extracted URL string.
 * @throws {Error} If the URL is missing or invalid.
 */
export function extractUrl(rawUrl: unknown): string {
    if (typeof rawUrl === 'string') return rawUrl;
    if (Array.isArray(rawUrl)) {
        const first = rawUrl[0];
        if (typeof first === 'string') return first;
    }
    throw new Error(ErrorMessages.FILE.URL_REQUIRED);
}

/**
 * Validate URL format and scheme.
 * @param rawUrl - The raw URL input to validate.
 * @returns The validated URL object.
 * @throws {Error} If the URL is invalid or uses an unsupported protocol.
 */
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

    if (!target.hostname) {
        throw new Error(ErrorMessages.FILE.HOSTNAME_REQUIRED);
    }

    // Normalize hostname in-place
    target.hostname = normalizeHostname(target.hostname);
    return target;
}

/**
 * Check if hostname is blocked either by exact match or by blocked suffix.
 * @param hostname - The hostname to check.
 * @returns True if the hostname is blocked, false otherwise.
 */
export function isBlockedHostname(hostname: string): boolean {
    const h = normalizeHostname(hostname);
    if (BLOCKED_HOSTNAMES.has(h)) return true;
    for (const suf of BLOCKED_HOSTNAME_SUFFIXES) {
        if (h.endsWith(suf)) return true;
    }
    return false;
}

/**
 * Check if IP address is in disallowed ranges.
 * @param address - The IP address to check.
 * @returns True if the address is disallowed, false otherwise.
 */
export function isDisallowedAddress(address: string): boolean {
    try {
        const parsed = ipaddr.parse(address);
        let normalized: ipaddr.IPv4 | ipaddr.IPv6 = parsed as any;

        if (parsed.kind() === 'ipv6') {
            const ipv6 = parsed as ipaddr.IPv6;
            if (ipv6.isIPv4MappedAddress()) normalized = ipv6.toIPv4Address();
        }

        const range = normalized.range();
        return DISALLOWED_RANGES.has(range);
    } catch {
        // If parsing fails, treat as disallowed to be safe
        return true;
    }
}

/**
 * Perform a DNS lookup with verbatim results and validate all resolved addresses.
 * Throws on any resolution error or if any resolved address is disallowed.
 * @param hostname - The hostname to resolve.
 * @returns A list of resolved IP addresses.
 * @throws {Error} If resolution fails or an address is disallowed.
 */
export async function resolveAndCheck(hostname: string) {
    try {
        const records = await dns.lookup(hostname, {
            all: true,
            verbatim: true,
        });
        if (!records || records.length === 0) throw new Error('no records');

        for (const rec of records) {
            if (isDisallowedAddress(rec.address)) {
                throw new Error(ErrorMessages.FILE.DISALLOWED_ADDRESS);
            }
        }

        return records.map((r) => r.address);
    } catch (err) {
        logger.error('Failed to resolve hostname:', err);
        throw new Error(ErrorMessages.FILE.FAILED_RESOLVE_HOSTNAME);
    }
}

/**
 * Ensure URL is allowed by applying a set of SSRF checks.
 * - Blocklisted hostnames/suffixes
 * - If hostname is an IP literal, validate it directly
 * - Resolve DNS (verbatim) and validate resolved addresses
 * @param url - The URL to validate.
 * @throws {Error} If the URL is disallowed.
 */
export async function ensureUrlAllowed(url: URL): Promise<void> {
    const hostname = normalizeHostname(url.hostname);

    if (isBlockedHostname(hostname))
        throw new Error(ErrorMessages.FILE.HOST_NOT_ALLOWED);

    // If user supplied an IP literal, validate directly
    if (ipaddr.isValid(hostname)) {
        if (isDisallowedAddress(hostname))
            throw new Error(ErrorMessages.FILE.DISALLOWED_ADDRESS);
        return;
    }

    // Resolve and validate addresses
    await resolveAndCheck(hostname);
}

/**
 * Fetch URL with manual redirect handling and validation.
 * Note: This re-resolves DNS before each request/redirect to reduce TOCTOU risk.
 * For stricter pinning, consider using a custom agent and pinned lookup.
 * @param url - The initial URL to fetch.
 * @param init - Optional request initialization parameters.
 * @returns The fetch response.
 * @throws {Error} If the fetch fails or violates security policies.
 */
export async function fetchWithRedirects(
    url: URL,
    init: RequestInit = {},
): Promise<Response> {
    let currentUrl = new URL(url.toString());
    let redirects = 0;

    // Validate initial URL
    await ensureUrlAllowed(currentUrl);

    while (true) {
        // Re-resolve current host right before the request to reduce DNS TOCTOU window
        await resolveAndCheck(currentUrl.hostname);

        const response = await fetch(currentUrl, {
            ...init,
            redirect: 'manual',
        });

        const location = response.headers.get('location');
        if (location && response.status >= 300 && response.status < 400) {
            redirects += 1;
            if (redirects > MAX_REDIRECTS)
                throw new Error(ErrorMessages.FILE.TOO_MANY_REDIRECTS);

            const nextUrl = new URL(location, currentUrl);
            // Normalize hostname and re-validate
            nextUrl.hostname = normalizeHostname(nextUrl.hostname);
            await ensureUrlAllowed(nextUrl);

            currentUrl = nextUrl;
            continue;
        }

        return response;
    }
}

/**
 * Read response body stream with size limit. Returns a Buffer.
 * @param stream - The readable stream to read from.
 * @param maxBytes - The maximum number of bytes to read.
 * @returns The body content as a Buffer.
 * @throws {Error} If the size limit is exceeded.
 */
export async function readBodyWithLimit(
    stream: WebReadableStream<Uint8Array> | null,
    maxBytes: number,
): Promise<Buffer> {
    if (!stream) return Buffer.alloc(0);

    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (!value) continue;

            total += value.length;
            if (total > maxBytes) {
                await reader.cancel();
                throw new Error(ErrorMessages.FILE.SIZE_EXCEEDS_LIMIT);
            }

            chunks.push(value);
        }
    } finally {
        // best-effort cancel / release
        try {
            await reader.cancel();
        } catch {}
    }

    if (chunks.length === 0) return Buffer.alloc(0);
    return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}
