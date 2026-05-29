import { Injectable, Inject, Logger } from '@nestjs/common';
import { injectable, inject } from 'inversify';
import { TYPES } from '@/di/types';
import crypto from 'crypto';
import { ScraperService } from './ScraperService';
import type {
    IServerMessageRepository,
    IServerMessage,
} from '@/di/interfaces/IServerMessageRepository';
import type {
    IMessageRepository,
    IMessage,
} from '@/di/interfaces/IMessageRepository';
import type { IWsServer } from '@/ws/interfaces/IWsServer';
import type { AnyResponseWsEvent } from '@/ws/protocol/envelope';
import type { IEmbed } from '@/models/Embed';
import type { IRedisService } from '@/di/interfaces/IRedisService';

@Injectable()
@injectable()
export class EmbedService {
    private readonly logger = new Logger(EmbedService.name);
    private readonly urlRegex =
        /(?<!\[%file%\]\()(?<!<)https?:\/\/[^\s\)>]+(?!>)/g;

    public constructor(
        @Inject(TYPES.ScraperService)
        @inject(TYPES.ScraperService)
        private scraperService: ScraperService,
        @Inject(TYPES.ServerMessageRepository)
        @inject(TYPES.ServerMessageRepository)
        private serverMessageRepo: IServerMessageRepository,
        @Inject(TYPES.MessageRepository)
        @inject(TYPES.MessageRepository)
        private messageRepo: IMessageRepository,
        @Inject(TYPES.WsServer)
        @inject(TYPES.WsServer)
        private wsServer: IWsServer,
        @Inject(TYPES.RedisService)
        @inject(TYPES.RedisService)
        private redisService: IRedisService,
    ) {}

    public async processServerMessage(message: IServerMessage): Promise<void> {
        await this.processMessage(message, true);
    }

    public async processUserMessage(message: IMessage): Promise<void> {
        await this.processMessage(message, false);
    }

    private async processMessage(
        message: IServerMessage | IMessage,
        isServerMessage: boolean,
    ): Promise<void> {
        if (message.noEmbeds === true) {
            this.logger.debug(
                `Skipping embed processing because noEmbeds is set to true on message: ${message._id}`,
            );
            return;
        }

        const text = message.text || '';
        const urls = text.match(this.urlRegex);

        if (!urls || urls.length === 0) {
            this.logger.debug(
                `No URLs found in message text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`,
            );
            return;
        }

        this.logger.debug(
            `Found ${urls.length} URLs in message text: ${urls.join(', ')}`,
        );
        const textUrls = urls;
        const existingEmbeds = message.embeds || [];
        const MAX_EMBEDS = 5;

        if (existingEmbeds.length >= MAX_EMBEDS) return;

        const textCounts: Record<string, number> = {};
        const internalHostRegex =
            /^https?:\/\/(?:[a-zA-Z0-9.-]*\.)?(?:ser\.chat|catfla\.re)(?::\d+)?(?:\/|$)/;
        const isInternalUrl = (url: string): boolean =>
            internalHostRegex.test(url) || url.startsWith('http://localhost:');

        for (const url of textUrls) {
            if (url.includes('/invite/')) continue;
            if (url.includes('/api/v1/files/download/')) continue;
            if (url.includes('/api/v1/files/proxy/')) continue;
            if (isInternalUrl(url)) continue;

            const norm = url.replace(/\/$/, '');
            const currentCount = textCounts[norm] ?? 0;
            textCounts[norm] = currentCount + 1;
        }

        const existingCounts: Record<string, number> = {};
        for (const embed of existingEmbeds) {
            const norm = (embed.url ?? '').replace(/\/$/, '');
            if (norm !== '') {
                const currentCount = existingCounts[norm] ?? 0;
                existingCounts[norm] = currentCount + 1;
            }
        }

        const urlsToScrape: string[] = [];
        let projectedCount = existingEmbeds.length;

        for (const [norm, count] of Object.entries(textCounts)) {
            if (projectedCount >= MAX_EMBEDS) break;

            const existing = existingCounts[norm] ?? 0;
            if (existing < count) {
                const originalUrl = textUrls.find(
                    (u) => u.replace(/\/$/, '') === norm,
                );
                if (originalUrl !== undefined) {
                    const needed = Math.min(
                        count - existing,
                        MAX_EMBEDS - projectedCount,
                    );
                    for (let i = 0; i < needed; i++) {
                        urlsToScrape.push(originalUrl);
                        projectedCount++;
                    }
                }
            }
        }

        if (urlsToScrape.length === 0) return;

        const newEmbeds: IEmbed[] = [];

        for (const url of urlsToScrape) {
            try {
                const cacheKey = `embed:cache:v2:${url}`;
                const cached = await this.redisService
                    .getClient()
                    .get(cacheKey);
                if (cached !== null) {
                    this.logger.debug(`Cache hit for URL: ${url}`);
                    newEmbeds.push(JSON.parse(cached));
                    continue;
                }

                this.logger.debug(`Scraping URL for embed: ${url}`);
                const result = await this.scraperService.scrape(url);

                const isImage = result.mimeType.startsWith('image/');
                const isVideo = result.mimeType.startsWith('video/');
                const isYouTube = result.embedVideoUrl !== undefined;

                const embed: IEmbed = {
                    type: isYouTube
                        ? 'youtube'
                        : isImage
                          ? 'image'
                          : isVideo
                            ? 'video'
                            : 'link',
                    url: result.url,
                };

                if (result.title !== undefined) embed.title = result.title;
                if (result.description !== undefined)
                    embed.description = result.description;
                if (result.image !== undefined) {
                    embed.image = {
                        url: `/api/v1/embed/proxy-image?file=${encodeURIComponent(result.image)}`,
                    };
                }
                if (isYouTube && result.embedVideoUrl !== undefined) {
                    embed.video = { url: result.embedVideoUrl };
                } else if (result.video !== undefined) {
                    embed.video = { url: result.video };
                }
                if (result.authorName !== undefined) {
                    embed.author = {
                        name: result.authorName,
                        url: result.authorUrl,
                    };
                }
                if (result.providerName !== undefined) {
                    embed.provider = {
                        name: result.providerName,
                        url: result.providerUrl,
                    };
                }
                if (isYouTube) {
                    embed.color = 0xff0000;
                } else if (result.themeColor !== undefined) {
                    const colorStr = result.themeColor.replace('#', '');
                    const colorInt = parseInt(colorStr, 16);
                    if (!isNaN(colorInt)) embed.color = colorInt;
                }

                if (
                    embed.title !== undefined ||
                    embed.image !== undefined ||
                    embed.description !== undefined ||
                    embed.video !== undefined
                ) {
                    newEmbeds.push(embed);
                    await this.redisService
                        .getClient()
                        .set(cacheKey, JSON.stringify(embed), 'EX', 3600);
                }

                if (url.startsWith('https://')) {
                    const proxyHash = crypto
                        .createHash('sha256')
                        .update(url)
                        .digest('hex');
                    await this.redisService
                        .getClient()
                        .set(
                            `proxy:allow:${proxyHash}`,
                            url,
                            'EX',
                            60 * 60 * 24 * 7,
                        );
                }
            } catch (err) {
                this.logger.warn(
                    `Failed to scrape URL ${url}: ${(err as Error).message}`,
                );
            }
        }

        if (newEmbeds.length === 0) return;

        const allEmbeds = [...(message.embeds || []), ...newEmbeds];

        if (isServerMessage) {
            const serverMsg = message as IServerMessage;
            await this.serverMessageRepo.update(serverMsg._id, {
                embeds: allEmbeds,
            });

            this.logger.debug(
                `Broadcasting updated embeds for message ${serverMsg._id} in channel ${serverMsg.channelId}`,
            );

            await this.wsServer.broadcastToServerWithPermission(
                serverMsg.serverId.toString(),
                {
                    type: 'message_server_embeds_updated',
                    payload: {
                        messageId: serverMsg._id.toString(),
                        serverId: serverMsg.serverId.toString(),
                        channelId: serverMsg.channelId.toString(),
                        embeds: allEmbeds,
                    },
                },
                {
                    type: 'channel',
                    targetId: serverMsg.channelId.toString(),
                    permission: 'viewChannels',
                },
            );
        } else {
            const userMsg = message as IMessage;
            await this.messageRepo.updateMessage(userMsg._id.toString(), {
                embeds: allEmbeds,
            });

            const embedsEvent = {
                type: 'message_dm_embeds_updated' as const,
                payload: {
                    messageId: userMsg._id.toString(),
                    embeds: allEmbeds,
                },
            } as AnyResponseWsEvent;

            this.wsServer.broadcastToUser(
                userMsg.senderId.toString(),
                embedsEvent,
            );
            this.wsServer.broadcastToUser(
                userMsg.receiverId.toString(),
                embedsEvent,
            );
        }
    }
}
