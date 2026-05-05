import type { Request, Response, NextFunction } from 'express';
import { container } from '@/di/container';
import { TYPES } from '@/di/types';
import type { IInviteRepository } from '@/di/interfaces/IInviteRepository';
import type { IServerRepository } from '@/di/interfaces/IServerRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import { SERVER_URL } from '@/config/env';

/**
 * Middleware to detect Discord crawlers and serve a invite link preview.
 */
const escapeHtml = (unsafe: string) => {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
 };

export const discordCrawlerPreview = async (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : '';
    const isDiscordBot =
        userAgent.includes('Discordbot') ||
        userAgent.includes('Discord-ExternalFetcher');

    // Intercept if it's a Discord bot or testing and matching the invite path
    if (isDiscordBot && req.path.startsWith('/invite/')) {
        const inviteCode = req.path.split('/')[2];
        if (inviteCode === undefined || inviteCode === '') {
            return next();
        }

        try {
            const inviteRepo = container.get<IInviteRepository>(
                TYPES.InviteRepository,
            );
            const serverRepo = container.get<IServerRepository>(
                TYPES.ServerRepository,
            );
            const memberRepo = container.get<IServerMemberRepository>(
                TYPES.ServerMemberRepository,
            );

            const invite = await inviteRepo.findByCodeOrCustomPath(inviteCode);
            if (!invite) {
                return next();
            }

            const server = await serverRepo.findById(invite.serverId);
            if (!server) {
                return next();
            }

            const memberCount = await memberRepo.countByServerId(
                invite.serverId,
            );

            const title = escapeHtml(`Join ${server.name}`);
            const description = escapeHtml(`You've been invited to join ${server.name} on Serchat. Current members: ${memberCount}.`);
            const imageUrl = (server.icon !== undefined && server.icon !== '')
                ? `${SERVER_URL}/api/v1/file-proxy?url=${encodeURIComponent(server.icon)}`
                : `${SERVER_URL}/logo.png`;
            const url = escapeHtml(`${SERVER_URL}/invite/${inviteCode}`);
            const themeColor = '#5865F2';

            const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <meta name="description" content="${description}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${imageUrl}">
    <meta property="og:url" content="${url}">
    <meta property="og:site_name" content="Serchat">
    <meta property="og:type" content="website">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="theme-color" content="${themeColor}">
</head>
<body>
    <h1>${title}</h1>
    <p>${description}</p>
</body>
</html>`;

            return res.status(200).send(html);
        } catch (error) {
            console.error('Crawler preview middleware error:', error);
            return next();
        }
    }

    next();
};
