import type { Request } from 'express';

export function extractClientIp(req: Request): string {
    // Priority: CF-Connecting-IP, X-Forwarded-For, X-Real-IP, req.ip, socket.remoteAddress
    const cfIp = req.headers['cf-connecting-ip'];
    const forwardedFor = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];

    if (cfIp !== undefined) {
        const ip = Array.isArray(cfIp) ? cfIp[0] : cfIp;
        if (ip !== undefined && ip !== '') return ip.trim();
    }

    if (forwardedFor !== undefined) {
        const ip = Array.isArray(forwardedFor)
            ? forwardedFor[0]
            : forwardedFor.split(',')[0];
        if (ip !== undefined && ip !== '') return ip.trim();
    }

    if (realIp !== undefined) {
        const ip = Array.isArray(realIp) ? realIp[0] : realIp;
        if (ip !== undefined && ip !== '') return ip;
    }

    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
