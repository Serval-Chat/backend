import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { isIP } from 'net';
import { domainToASCII } from 'url';

export const WEBSITE_CONNECTION_TYPE = 'Website' as const;
export const WEBSITE_VERIFICATION_PREFIX = 'serchat-site-verification=';
export const WEBSITE_VERIFICATION_FAILURE =
    'Failed to validate the website is yours';

export interface NormalizedWebsite {
    value: string;
    normalizedValue: string;
    verificationRecordName: string;
}

export function normalizeWebsite(input: string): NormalizedWebsite {
    const raw = input.trim();
    if (raw === '' || raw.length > 253 || raw.includes('*')) {
        throw new Error('Invalid website');
    }

    const parsed = new URL(
        /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(raw) ? raw : `https://${raw}`,
    );
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Invalid website');
    }
    if (
        (parsed.pathname !== '' && parsed.pathname !== '/') ||
        parsed.search !== '' ||
        parsed.hash !== '' ||
        parsed.username !== '' ||
        parsed.password !== ''
    ) {
        throw new Error('Invalid website');
    }

    const host = parsed.hostname.replace(/\.$/, '').toLowerCase();
    const asciiHost = domainToASCII(host);
    if (
        asciiHost === '' ||
        asciiHost.length > 253 ||
        asciiHost === 'localhost' ||
        !asciiHost.includes('.') ||
        isIP(asciiHost) !== 0
    ) {
        throw new Error('Invalid website');
    }

    const labels = asciiHost.split('.');
    if (
        labels.some(
            (label) =>
                label.length === 0 ||
                label.length > 63 ||
                label.startsWith('-') ||
                label.endsWith('-') ||
                /^[a-z0-9-]+$/.test(label) === false,
        )
    ) {
        throw new Error('Invalid website');
    }

    return {
        value: asciiHost,
        normalizedValue: asciiHost,
        verificationRecordName: `_serchat.${asciiHost}`,
    };
}

export function createWebsiteVerificationToken(): string {
    return randomBytes(32).toString('base64url');
}

export function hashWebsiteVerificationToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

export function verifyWebsiteTokenHash(token: string, hash: string): boolean {
    const tokenHash = Buffer.from(hashWebsiteVerificationToken(token), 'hex');
    const expectedHash = Buffer.from(hash, 'hex');
    return (
        tokenHash.length === expectedHash.length &&
        timingSafeEqual(tokenHash, expectedHash)
    );
}

export async function resolveTxtRecordsViaDoh(name: string): Promise<string[]> {
    try {
        const cloudflareRecords = await queryCloudflareTxt(name);
        return cloudflareRecords;
    } catch {
        return queryGoogleTxt(name);
    }
}

async function queryCloudflareTxt(name: string): Promise<string[]> {
    const response = await fetch(
        `https://1.1.1.1/dns-query?name=${encodeURIComponent(name)}&type=TXT`,
        { headers: { accept: 'application/dns-json' } },
    );
    if (!response.ok) throw new Error('Cloudflare DoH failed');
    return parseDohTxtResponse((await response.json()) as DohResponse);
}

async function queryGoogleTxt(name: string): Promise<string[]> {
    const response = await fetch(
        `https://8.8.8.8/resolve?name=${encodeURIComponent(name)}&type=TXT`,
    );
    if (!response.ok) throw new Error('Google DoH failed');
    return parseDohTxtResponse((await response.json()) as DohResponse);
}

interface DohResponse {
    Answer?: Array<{ type?: number; data?: string }>;
}

function parseDohTxtResponse(response: DohResponse): string[] {
    return (response.Answer ?? [])
        .filter(
            (answer) => answer.type === 16 && typeof answer.data === 'string',
        )
        .map((answer) => normalizeTxtRecord(answer.data ?? ''));
}

function normalizeTxtRecord(value: string): string {
    const parts = value.match(/"((?:[^"\\]|\\.)*)"/g);
    if (parts === null) return value;
    return parts
        .map((part) =>
            part.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\'),
        )
        .join('');
}
