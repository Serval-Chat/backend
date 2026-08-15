import { Controller, Get, Query, Res, Inject } from '@nestjs/common';
import { Response } from 'express';
import { TYPES } from '@/di/types';
import { ILogger } from '@/di/interfaces/ILogger';
import { SCRAPER_HOST, SCRAPER_PORT } from '@/config/env';
import { fetch } from 'undici';
import {
    ApiTags,
    ApiOperation,
    ApiOkResponse,
    ApiProduces,
} from '@nestjs/swagger';
import type { IRedisService } from '@/di/interfaces/IRedisService';
import { ScraperService } from '@/services/ScraperService';
import { Public } from '@/modules/auth/public.decorator';
import crypto from 'crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const CACHE_FILE_RE = /^[a-f0-9]{32}\.webp$/;
const CACHE_CONTENT_TYPE = 'image/webp';
const UPSTREAM_TIMEOUT_MS = 5_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const RESOLVED_IMAGE_TTL_SECONDS = 60 * 60 * 24;

function setImageHeaders(res: Response): void {
    res.setHeader('Content-Type', CACHE_CONTENT_TYPE);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline; filename="image.webp"');
    res.setHeader('Cache-Control', 'public, max-age=86400');
}

function oversized(response: {
    headers: { get: (name: string) => string | null };
}): boolean {
    const declared = Number(response.headers.get('content-length'));
    return Number.isFinite(declared) && declared > MAX_IMAGE_BYTES;
}

async function streamImage(
    body: NonNullable<Awaited<ReturnType<typeof fetch>>['body']>,
    res: Response,
): Promise<void> {
    let written = 0;
    const capped = new Readable({
        read() {},
    });

    const pump = (async () => {
        try {
            for await (const chunk of body) {
                written += chunk.length;
                if (written > MAX_IMAGE_BYTES) {
                    capped.destroy(
                        new Error('Upstream image exceeded the size limit'),
                    );
                    return;
                }
                capped.push(chunk);
            }
            capped.push(null);
        } catch (err) {
            capped.destroy(err as Error);
        }
    })();

    await Promise.all([pipeline(capped, res), pump]);
}

@ApiTags('Embed')
@Controller('api/v1/embed')
@Public()
export class EmbedController {
    public constructor(
        @Inject(TYPES.Logger) private logger: ILogger,
        @Inject(TYPES.RedisService) private redisService: IRedisService,
        @Inject(TYPES.ScraperService) private scraperService: ScraperService,
    ) {}

    @Get('proxy-image')
    @ApiOperation({
        summary: 'Proxy and cache an image from the scraper service',
    })
    @ApiOkResponse({ type: String, description: 'Proxied image' })
    @ApiProduces('image/webp', 'image/png', 'image/jpeg')
    public async proxyImage(
        @Query('file') file: string,
        @Res() res: Response,
    ): Promise<void> {
        if (!file) {
            res.status(400).send('Missing file parameter');
            return;
        }

        if (!CACHE_FILE_RE.test(file)) {
            this.logger.warn(
                `Blocked invalid embed proxy request for file: ${file}`,
            );
            res.status(400).send('Invalid file format');
            return;
        }

        const internalUrl = `http://${SCRAPER_HOST}:${SCRAPER_PORT}/cache/${file}`;

        try {
            const response = await fetch(internalUrl, {
                signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
            });
            if (!response.ok) {
                this.logger.error(
                    `Failed to fetch image from scraper (${internalUrl}): ${response.status}`,
                );
                res.status(response.status).send('Image not found in cache');
                return;
            }

            if (oversized(response)) {
                this.logger.error(
                    `Scraper cache image exceeds the size limit: ${file}`,
                );
                res.status(502).send('Upstream image too large');
                return;
            }

            setImageHeaders(res);

            if (response.body) {
                await streamImage(response.body, res);
            } else {
                res.end();
            }
        } catch (err) {
            this.logger.error(`Failed to proxy embed image: ${file}`, err);
            if (!res.headersSent) {
                res.status(500).send('Internal Server Error');
            } else {
                res.destroy();
            }
        }
    }

    @Get('proxy')
    @ApiOperation({
        summary: 'Proxy an allowlisted external URL',
    })
    @ApiOkResponse({ type: String, description: 'Proxied image' })
    @ApiProduces('image/webp', 'image/png', 'image/jpeg')
    public async proxy(
        @Query('url') url: string,
        @Res() res: Response,
    ): Promise<void> {
        if (!url || !url.startsWith('https://')) {
            res.status(400).send('Missing or invalid url parameter');
            return;
        }

        const hash = crypto.createHash('sha256').update(url).digest('hex');
        const allowed = await this.redisService
            .getClient()
            .get(`proxy:allow:${hash}`);

        if (allowed === null) {
            this.logger.warn(`Blocked non-allowlisted proxy request: ${url}`);
            res.status(403).send('URL not allowlisted');
            return;
        }

        const redis = this.redisService.getClient();
        const resolvedKey = `proxy:image:${hash}`;

        try {
            const cachedFile = await redis.get(resolvedKey);
            if (cachedFile !== null && CACHE_FILE_RE.test(cachedFile)) {
                const served = await this.serveCacheFile(cachedFile, res);
                if (served) return;
                await redis.del(resolvedKey);
            }

            const scrapeResult = await this.scraperService.scrape(url);

            if (scrapeResult.image === undefined || scrapeResult.image === '') {
                this.logger.error(
                    `Scraper failed to process or returned no image for URL: ${url}`,
                );
                res.status(502).send('Upstream processing failed');
                return;
            }

            if (!CACHE_FILE_RE.test(scrapeResult.image)) {
                this.logger.error(
                    `Scraper returned an unexpected cache filename for URL: ${url}`,
                );
                res.status(502).send('Upstream processing failed');
                return;
            }

            await redis.set(
                resolvedKey,
                scrapeResult.image,
                'EX',
                RESOLVED_IMAGE_TTL_SECONDS,
            );

            if (!(await this.serveCacheFile(scrapeResult.image, res))) {
                res.status(502).send('Image not found in cache');
            }
        } catch (err) {
            this.logger.error(`Failed to proxy URL: ${url}`, err);
            if (!res.headersSent) {
                res.status(500).send('Internal Server Error');
            } else {
                res.destroy();
            }
        }
    }

    private async serveCacheFile(
        file: string,
        res: Response,
    ): Promise<boolean> {
        const internalUrl = `http://${SCRAPER_HOST}:${SCRAPER_PORT}/cache/${file}`;
        const response = await fetch(internalUrl, {
            signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        });

        if (!response.ok) {
            this.logger.error(
                `Failed to fetch image from scraper cache (${internalUrl}): ${response.status}`,
            );
            return false;
        }

        if (oversized(response)) {
            this.logger.error(
                `Scraper cache image exceeds the size limit: ${file}`,
            );
            res.status(502).send('Upstream image too large');
            return true;
        }

        setImageHeaders(res);

        if (response.body) {
            await streamImage(response.body, res);
        } else {
            res.end();
        }
        return true;
    }
}
