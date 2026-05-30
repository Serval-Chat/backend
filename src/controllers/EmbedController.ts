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
import { injectable } from 'inversify';
import type { IRedisService } from '@/di/interfaces/IRedisService';
import { ScraperService } from '@/services/ScraperService';
import crypto from 'crypto';

@ApiTags('Embed')
@injectable()
@Controller('api/v1/embed')
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

        const fileRegex = /^[a-f0-9]{32}\.webp$/;
        if (!fileRegex.test(file)) {
            this.logger.warn(
                `Blocked invalid embed proxy request for file: ${file}`,
            );
            res.status(400).send('Invalid file format');
            return;
        }

        const internalUrl = `http://${SCRAPER_HOST}:${SCRAPER_PORT}/cache/${file}`;

        try {
            const response = await fetch(internalUrl);
            if (!response.ok) {
                this.logger.error(
                    `Failed to fetch image from scraper (${internalUrl}): ${response.status}`,
                );
                res.status(response.status).send('Image not found in cache');
                return;
            }

            const contentType =
                response.headers.get('content-type') ?? 'image/webp';
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=86400');

            const body = response.body;
            if (body) {
                for await (const chunk of body) {
                    res.write(chunk);
                }
            }
            res.end();
        } catch (err) {
            this.logger.error(`Failed to proxy embed image: ${file}`, err);
            res.status(500).send('Internal Server Error');
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

        try {
            const scrapeResult = await this.scraperService.scrape(url);

            if (scrapeResult.image === undefined || scrapeResult.image === '') {
                this.logger.error(
                    `Scraper failed to process or returned no image for URL: ${url}`,
                );
                res.status(502).send('Upstream processing failed');
                return;
            }

            const internalUrl = `http://${SCRAPER_HOST}:${SCRAPER_PORT}/cache/${scrapeResult.image}`;
            const response = await fetch(internalUrl);

            if (!response.ok) {
                this.logger.error(
                    `Failed to fetch image from scraper cache (${internalUrl}): ${response.status}`,
                );
                res.status(response.status).send('Image not found in cache');
                return;
            }

            const rawContentType = response.headers.get('content-type') ?? '';
            const contentType = rawContentType.split(';')[0]?.trim() ?? '';

            res.setHeader('Content-Type', contentType || 'image/webp');
            res.setHeader('Cache-Control', 'public, max-age=86400');

            const body = response.body;
            if (body) {
                for await (const chunk of body) {
                    res.write(chunk);
                }
            }
            res.end();
        } catch (err) {
            this.logger.error(`Failed to proxy URL: ${url}`, err);
            res.status(500).send('Internal Server Error');
        }
    }
}
