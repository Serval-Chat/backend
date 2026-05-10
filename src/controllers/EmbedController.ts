import { Controller, Get, Query, Res, Inject } from '@nestjs/common';
import { Response } from 'express';
import { TYPES } from '@/di/types';
import { ILogger } from '@/di/interfaces/ILogger';
import { SCRAPER_HOST, SCRAPER_PORT } from '@/config/env';
import { fetch } from 'undici';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { injectable } from 'inversify';

@ApiTags('Embed')
@injectable()
@Controller('api/v1/embed')
export class EmbedController {
    public constructor(@Inject(TYPES.Logger) private logger: ILogger) {}

    @Get('proxy-image')
    @ApiOperation({
        summary: 'Proxy and cache an image from the scraper service',
    })
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
}
