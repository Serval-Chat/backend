import crypto from 'crypto';
import { APP_ENCRYPTION_KEY } from '@/config/env';

const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_ALGO = 'sha1';
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function normalizeEncryptionKey(): Buffer {
    const raw = APP_ENCRYPTION_KEY.trim();
    const asHex = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : null;
    if (asHex && asHex.length === 32) return asHex;
    return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

function base32Encode(input: Buffer): string {
    let bits = 0;
    let value = 0;
    let output = '';

    for (const byte of input) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }

    if (bits > 0) {
        output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }

    return output;
}

function base32Decode(input: string): Buffer {
    const normalized = input.toUpperCase().replace(/=+$/g, '');
    let bits = 0;
    let value = 0;
    const output: number[] = [];

    for (const char of normalized) {
        const idx = BASE32_ALPHABET.indexOf(char);
        if (idx === -1) continue;
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            output.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }

    return Buffer.from(output);
}

function hotp(secret: Buffer, counter: number): string {
    const counterBuf = Buffer.alloc(8);
    const high = Math.floor(counter / 0x100000000);
    const low = counter >>> 0;
    counterBuf.writeUInt32BE(high, 0);
    counterBuf.writeUInt32BE(low, 4);

    const hmac = crypto
        .createHmac(TOTP_ALGO, secret)
        .update(counterBuf)
        .digest();
    const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
    const p0 = hmac[offset] ?? 0;
    const p1 = hmac[offset + 1] ?? 0;
    const p2 = hmac[offset + 2] ?? 0;
    const p3 = hmac[offset + 3] ?? 0;
    const binary =
        ((p0 & 0x7f) << 24) |
        ((p1 & 0xff) << 16) |
        ((p2 & 0xff) << 8) |
        (p3 & 0xff);
    const code = binary % 10 ** TOTP_DIGITS;
    return String(code).padStart(TOTP_DIGITS, '0');
}

function timingSafeEqualStr(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
}

export function generateTotpSecret(): string {
    return base32Encode(crypto.randomBytes(20));
}

export function generateOtpAuthUri(
    secret: string,
    label: string,
    issuer: string,
): string {
    const encodedLabel = encodeURIComponent(label);
    const encodedIssuer = encodeURIComponent(issuer);
    return `otpauth://totp/${encodedLabel}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
}

export function verifyTotp(
    secretBase32: string,
    code: string,
    window: number = 1,
): { valid: boolean; counter?: number } {
    const normalized = code.trim();
    if (!/^\d{6}$/.test(normalized)) return { valid: false };

    const secret = base32Decode(secretBase32);
    const nowCounter = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
    for (let offset = -window; offset <= window; offset++) {
        const counter = nowCounter + offset;
        const expected = hotp(secret, counter);
        if (timingSafeEqualStr(expected, normalized)) {
            return { valid: true, counter };
        }
    }
    return { valid: false };
}

export function encryptSecret(secret: string): string {
    const key = normalizeEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
        cipher.update(secret, 'utf8'),
        cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}.${tag.toString('base64')}.${ciphertext.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
    const [ivB64, tagB64, cipherB64] = payload.split('.');
    if (
        ivB64 === undefined ||
        ivB64 === '' ||
        tagB64 === undefined ||
        tagB64 === '' ||
        cipherB64 === undefined ||
        cipherB64 === ''
    ) {
        throw new Error('Invalid encrypted secret payload');
    }
    const key = normalizeEncryptionKey();
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const plaintext = Buffer.concat([
        decipher.update(Buffer.from(cipherB64, 'base64')),
        decipher.final(),
    ]);
    return plaintext.toString('utf8');
}

export function hashRecoveryCode(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}

export function generateBackupCodes(count: number = 10): string[] {
    const codes: string[] = [];
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let i = 0; i < count; i++) {
        const partA = Array.from(
            { length: 4 },
            () => chars[crypto.randomInt(0, chars.length)],
        ).join('');
        const partB = Array.from(
            { length: 4 },
            () => chars[crypto.randomInt(0, chars.length)],
        ).join('');
        codes.push(`${partA}-${partB}`);
    }
    return codes;
}

export function normalizeBackupCode(input: string): string {
    return input.trim().toUpperCase();
}
