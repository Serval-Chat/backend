import { Controller, Get, Query, Req, Res, Inject } from '@nestjs/common';
import { TYPES } from '@/di/types';
import { ILogger } from '@/di/interfaces/ILogger';
import { ApiTags, ApiResponse, ApiOperation } from '@nestjs/swagger';
import { Request, Response } from 'express';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import {
    getCacheKey,
    sanitizeHeaders,
    validateUrl,
    fetchWithRedirects,
    readBodyWithLimit,
} from '@/services/FileProxyService';
import { ErrorMessages } from '@/constants/errorMessages';
import { ApiError } from '@/utils/ApiError';

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
const CACHE_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

type HeaderRecord = Record<string, string>;

interface CacheEntry {
    buffer: Buffer;
    status: number;
    headers: HeaderRecord;
    expiresAt: number;
    size: number;
}

interface MetaCacheEntry {
    status: number;
    headers: HeaderRecord;
    size?: number;
    expiresAt: number;
}

import { FileProxyMetaResponseDTO } from './dto/file-proxy.response.dto';
import { injectable } from 'inversify';
import type { IRedisService } from '@/di/interfaces/IRedisService';
import { ImageDeliveryService } from '@/services/ImageDeliveryService';

@ApiTags('File Proxy')
@injectable()
@Controller('api/v1/file-proxy')
export class FileProxyController {
    public constructor(
        @Inject(TYPES.Logger)
        private logger: ILogger,
        @Inject(TYPES.RedisService)
        private redisService: IRedisService,
        @Inject(TYPES.ImageDeliveryService)
        private imageDeliveryService: ImageDeliveryService,
    ) {}

    // Rewrite the old URL to new URL so old messages that use the old URL are still valid
    private rewriteKbityUrl(url: URL): URL {
        if (url.hostname === 'kbity.catflare.cloud') {
            const newUrl = new URL(url.toString());
            newUrl.hostname = 'catfla.re';
            return newUrl;
        }
        return url;
    }

    @Get()
    @ApiOperation({ summary: 'Proxy a remote file' })
    @ApiResponse({ status: 200, description: 'File content' })
    @ApiResponse({ status: 400, description: 'Bad Request' })
    @ApiResponse({ status: 413, description: 'File too large' })
    @ApiResponse({ status: 502, description: 'Bad Gateway' })
    public async proxyFile(
        @Query('url') url: string,
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<void> {
        try {
            let targetUrl = validateUrl(url);
            const cacheKey = getCacheKey(targetUrl.toString());
            const now = Date.now();
            const cacheStr = await this.redisService
                .getClient()
                .get(`proxy:dl:${cacheKey}`);
            let cached: CacheEntry | null = null;
            if (cacheStr !== null && cacheStr !== '') {
                try {
                    const parsed = JSON.parse(cacheStr);
                    cached = {
                        ...parsed,
                        buffer: Buffer.from(parsed.buffer, 'base64'),
                    };
                } catch (e) {
                    this.logger.error('Failed to parse cached file', e);
                }
            }

            targetUrl = this.rewriteKbityUrl(targetUrl);

            if (cached !== null) {
                for (const [header, value] of Object.entries(cached.headers)) {
                    res.setHeader(header, value);
                }
                res.setHeader('Content-Length', cached.size.toString());
                res.setHeader(
                    'Cache-Control',
                    'private, max-age=0, must-revalidate',
                );
                res.status(cached.status).send(cached.buffer);
                return;
            }

            try {
                const response = await fetchWithRedirects(targetUrl, {
                    method: 'GET',
                });

                if (response.ok !== true) {
                    res.status(response.status).json({
                        error: `${ErrorMessages.FILE.FAILED_FETCH_RESOURCE} (status ${response.status})`,
                    });
                    return;
                }

                const contentLengthHeader =
                    response.headers.get('content-length');
                // ... rest of logic
                if (
                    contentLengthHeader !== null &&
                    contentLengthHeader !== ''
                ) {
                    const parsed = Number(contentLengthHeader);
                    if (!Number.isNaN(parsed) && parsed > MAX_FILE_SIZE_BYTES) {
                        await response.body?.cancel();
                        res.status(413).json({
                            error: ErrorMessages.FILE.SIZE_EXCEEDS_LIMIT,
                        });
                        return;
                    }
                }

                let buffer: Buffer;
                try {
                    const bodyStream =
                        response.body as WebReadableStream<Uint8Array> | null;
                    buffer = await readBodyWithLimit(
                        bodyStream,
                        MAX_FILE_SIZE_BYTES,
                    );
                } catch (err) {
                    if (
                        err instanceof Error &&
                        err.message === 'MAX_FILE_SIZE_EXCEEDED'
                    ) {
                        res.status(413).json({
                            error: ErrorMessages.FILE.SIZE_EXCEEDS_LIMIT,
                        });
                        return;
                    }

                    res.status(502).json({
                        error: ErrorMessages.FILE.FAILED_DOWNLOAD_REMOTE,
                    });
                    return;
                }

                const headerRecord = sanitizeHeaders(response.headers);
                const originalMimeType =
                    headerRecord['content-type'] !== undefined &&
                    headerRecord['content-type'] !== ''
                        ? headerRecord['content-type']
                        : 'application/octet-stream';

                // Try to convert to WebP on the fly if it's an image and client supports it
                const {
                    buffer: processedBuffer,
                    contentType: finalContentType,
                } = await this.imageDeliveryService.processRemoteImage(
                    buffer,
                    originalMimeType,
                    req.headers.accept,
                    cacheKey, // Use the same cache key suffix
                );

                const size = processedBuffer.length;
                headerRecord['content-type'] = finalContentType;

                // Maintain cache size limits (original buffer is still in 'buffer',
                // but we might want to cache the processed one if it was converted)
                const entryToSave = {
                    buffer: processedBuffer.toString('base64'),
                    status: response.status,
                    headers: headerRecord,
                    size,
                    expiresAt: now + CACHE_TTL_MS,
                };
                await this.redisService
                    .getClient()
                    .set(
                        `proxy:dl:${cacheKey}`,
                        JSON.stringify(entryToSave),
                        'PX',
                        CACHE_TTL_MS,
                    );

                for (const [header, value] of Object.entries(headerRecord)) {
                    res.setHeader(header, value);
                }
                res.setHeader('Content-Length', size.toString());
                res.setHeader(
                    'Cache-Control',
                    'private, max-age=0, must-revalidate',
                );
                res.status(response.status).send(processedBuffer);
            } catch (err) {
                if (err instanceof Error) {
                    if (
                        err.message === ErrorMessages.FILE.URL_REQUIRED ||
                        err.message === ErrorMessages.FILE.INVALID_URL ||
                        err.message === ErrorMessages.FILE.ONLY_HTTP_HTTPS ||
                        err.message === ErrorMessages.FILE.HOST_NOT_ALLOWED ||
                        err.message === ErrorMessages.FILE.DISALLOWED_ADDRESS ||
                        err.message === ErrorMessages.FILE.TOO_MANY_REDIRECTS
                    ) {
                        res.status(400).json({ error: err.message });
                        return;
                    }
                }
                this.logger.error('Failed to proxy file:', err);
                if (res.headersSent !== true) {
                    res.status(502).json({
                        error: ErrorMessages.FILE.FAILED_PROXY,
                    });
                }
            }
        } catch (err) {
            if (err instanceof Error) {
                if (
                    err.message === ErrorMessages.FILE.URL_REQUIRED ||
                    err.message === ErrorMessages.FILE.INVALID_URL ||
                    err.message === ErrorMessages.FILE.ONLY_HTTP_HTTPS ||
                    err.message === ErrorMessages.FILE.HOST_NOT_ALLOWED ||
                    err.message === ErrorMessages.FILE.DISALLOWED_ADDRESS ||
                    err.message === ErrorMessages.FILE.TOO_MANY_REDIRECTS
                ) {
                    res.status(400).json({ error: err.message });
                    return;
                }
            }
            this.logger.error('Failed to proxy file:', err);
            if (res.headersSent !== true) {
                res.status(502).json({
                    error: ErrorMessages.FILE.FAILED_PROXY,
                });
            }
        }
    }

    @Get('meta')
    @ApiOperation({ summary: 'Get remote file metadata' })
    @ApiResponse({ status: 200, type: FileProxyMetaResponseDTO })
    @ApiResponse({ status: 400, description: 'Bad Request' })
    public async getFileMeta(
        @Query('url') url: string,
    ): Promise<FileProxyMetaResponseDTO> {
        try {
            const targetUrl = validateUrl(url);
            const cacheKey = getCacheKey(targetUrl.toString());
            const now = Date.now();
            const cacheStr = await this.redisService
                .getClient()
                .get(`proxy:meta:${cacheKey}`);
            let cached: MetaCacheEntry | null = null;
            if (cacheStr !== null && cacheStr !== '') {
                try {
                    cached = JSON.parse(cacheStr);
                } catch (e) {
                    this.logger.error('Failed to parse cached meta', e);
                }
            }

            if (cached !== null) {
                return {
                    status: cached.status,
                    headers: cached.headers,
                    size: cached.size,
                };
            }

            const response = await fetchWithRedirects(targetUrl, {
                method: 'HEAD',
            });

            const headerRecord = sanitizeHeaders(response.headers);
            const contentLength = response.headers.get('content-length');
            const parsedLength =
                contentLength !== null && contentLength !== ''
                    ? Number(contentLength)
                    : undefined;

            const entry: MetaCacheEntry = {
                status: response.status,
                headers: headerRecord,
                expiresAt: now + CACHE_TTL_MS,
            };
            if (
                typeof parsedLength === 'number' &&
                Number.isFinite(parsedLength)
            ) {
                entry.size = parsedLength;
            }

            await this.redisService
                .getClient()
                .set(
                    `proxy:meta:${cacheKey}`,
                    JSON.stringify(entry),
                    'PX',
                    CACHE_TTL_MS,
                );

            return {
                status: response.status,
                headers: headerRecord,
                size: entry.size,
            };
        } catch (err) {
            if (err instanceof Error) {
                if (
                    err.message === ErrorMessages.FILE.URL_REQUIRED ||
                    err.message === ErrorMessages.FILE.INVALID_URL ||
                    err.message === ErrorMessages.FILE.ONLY_HTTP_HTTPS ||
                    err.message === ErrorMessages.FILE.HOST_NOT_ALLOWED ||
                    err.message === ErrorMessages.FILE.DISALLOWED_ADDRESS ||
                    err.message === ErrorMessages.FILE.TOO_MANY_REDIRECTS
                ) {
                    throw new ApiError(400, err.message);
                }
            }

            this.logger.error('Failed to fetch metadata:', err);
            // Return 502 for upstream failures instead of 500
            throw new ApiError(502, ErrorMessages.FILE.FAILED_FETCH_META);
        }
    }
}
