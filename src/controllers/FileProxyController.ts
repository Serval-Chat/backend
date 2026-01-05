import {
    Controller,
    Get,
    Query,
    Req,
    Res,
    Inject,
} from '@nestjs/common';
import { TYPES } from '@/di/types';
import { ILogger } from '@/di/interfaces/ILogger';
import { ApiTags, ApiResponse, ApiOperation } from '@nestjs/swagger';
import { Request, Response } from 'express';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import {
    getCacheKey,
    pruneCache,
    sanitizeHeaders,
    validateUrl,
    fetchWithRedirects,
    readBodyWithLimit,
} from '@/services/FileProxyService';
import { ErrorMessages } from '@/constants/errorMessages';
import { ApiError } from '@/utils/ApiError';

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
const CACHE_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const MAX_CACHE_ENTRIES = 200;

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
import { injectable, inject } from 'inversify';

// Controller for proxying remote files to avoid CORS issues and SSRF attacks
@ApiTags('File Proxy')
@injectable()
@Controller('api/v1/file-proxy')
export class FileProxyController {
    private static downloadCache = new Map<string, CacheEntry>();
    private static metadataCache = new Map<string, MetaCacheEntry>();

    constructor(
        @inject(TYPES.Logger)
        @Inject(TYPES.Logger)
        private logger: ILogger,
    ) { }

    // Rewrite the old URL to new URL so old messages that use the old URL are still valid
    private rewriteKbityUrl(url: URL): URL {
        if (url.hostname === 'kbity.catflare.cloud') {
            // Rewrite legacy kbity.catflare.cloud URLs to catfla.re
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
            const cached = FileProxyController.downloadCache.get(cacheKey);

            targetUrl = this.rewriteKbityUrl(targetUrl);

            if (cached && cached.expiresAt > now) {
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

            if (cached) {
                FileProxyController.downloadCache.delete(cacheKey);
            }

            const response = await fetchWithRedirects(targetUrl, {
                method: 'GET',
            });

            if (!response.ok) {
                res.status(response.status).json({
                    error: `${ErrorMessages.FILE.FAILED_FETCH_RESOURCE} (status ${response.status})`,
                });
                return;
            }

            const contentLengthHeader = response.headers.get('content-length');
            if (contentLengthHeader) {
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
            const size = buffer.length;

            // Maintain cache size limits
            pruneCache(FileProxyController.downloadCache, MAX_CACHE_ENTRIES);
            FileProxyController.downloadCache.set(cacheKey, {
                buffer,
                status: response.status,
                headers: headerRecord,
                size,
                expiresAt: now + CACHE_TTL_MS,
            });

            for (const [header, value] of Object.entries(headerRecord)) {
                res.setHeader(header, value);
            }
            res.setHeader('Content-Length', size.toString());
            res.setHeader(
                'Cache-Control',
                'private, max-age=0, must-revalidate',
            );
            res.status(response.status).send(buffer);
        } catch (err) {
            if (err instanceof Error) {
                if (
                    err.message === ErrorMessages.FILE.URL_REQUIRED ||
                    err.message === ErrorMessages.FILE.INVALID_URL ||
                    err.message === ErrorMessages.FILE.ONLY_HTTP_HTTPS
                ) {
                    res.status(400).json({ error: err.message });
                    return;
                }
            }

            this.logger.error('Failed to proxy file:', err);
            // Since we're using @Res(), we must manually send the error response if we catch it here.
            // Throwing ApiError works too IF the exception filter catches it, BUT
            // typically when @Res() is used, Nest expects you to handle the response completely.
            // However, filters *can* catch exceptions from handlers using @Res() if passthrough isn't set,
            // but it's safer to use manual response here to match the success path style.
            // Actually, for consistency with other controllers, throwing ApiError is better IF we rely on the global filter.
            // But let's stick to the manual response for now as this controller is weird.
            // Wait, I just added ApiErrorFilter. It should handle errors.
            // Let's use ApiError for 500.
            if (!res.headersSent) {
                throw new ApiError(500, ErrorMessages.FILE.FAILED_PROXY);
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
            const cached = FileProxyController.metadataCache.get(cacheKey);

            if (cached && cached.expiresAt > now) {
                return {
                    status: cached.status,
                    headers: cached.headers,
                    size: cached.size,
                };
            }

            if (cached) {
                FileProxyController.metadataCache.delete(cacheKey);
            }

            const response = await fetchWithRedirects(targetUrl, {
                method: 'HEAD',
            });

            const headerRecord = sanitizeHeaders(response.headers);
            const contentLength = response.headers.get('content-length');
            const parsedLength = contentLength
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

            pruneCache(FileProxyController.metadataCache, MAX_CACHE_ENTRIES);
            FileProxyController.metadataCache.set(cacheKey, entry);

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
                    err.message === ErrorMessages.FILE.ONLY_HTTP_HTTPS
                ) {
                    throw new ApiError(400, err.message);
                }
            }

            this.logger.error('Failed to fetch metadata:', err);
            throw new ApiError(500, ErrorMessages.FILE.FAILED_FETCH_META);
        }
    }
}
