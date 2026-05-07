import type { Request } from 'express';

export function extractClientIp(req: Request): string {
    const cfIp = req.headers['cf-connecting-ip'];
    if (typeof cfIp === 'string' && cfIp !== '') return cfIp.trim();

    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor !== undefined) {
        const ip = Array.isArray(forwardedFor)
            ? forwardedFor[0]
            : forwardedFor.split(',')[0];
        if (ip !== undefined && ip !== '') return ip.trim();
    }

    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp !== '') return realIp.trim();

    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
