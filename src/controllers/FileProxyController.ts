import { Controller, Get, Route, Query, Response, Tags, Request } from 'tsoa';
import { injectable, inject } from 'inversify';
import { TYPES } from '@/di/types';
import type { ILogger } from '@/di/interfaces/ILogger';
import express from 'express';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import {
    getCacheKey,
    pruneCache,
    sanitizeHeaders,
    validateUrl,
    fetchWithRedirects,
    readBodyWithLimit,
} from '@/services/FileProxyService';
import { ErrorResponse } from '@/controllers/models/ErrorResponse';
import { ErrorMessages } from '@/constants/errorMessages';

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

/**
 * Controller for proxying remote files to avoid CORS issues and SSRF shitz
 */
@injectable()
@Route('api/v1/file-proxy')
@Tags('File Proxy')
export class FileProxyController extends Controller {
    private static downloadCache = new Map<string, CacheEntry>();
    private static metadataCache = new Map<string, MetaCacheEntry>();

    constructor(@inject(TYPES.Logger) private logger: ILogger) {
        super();
    }

    /**
        Rewrite the old URL to new URL so old messages that use the old URL are still valid.
    */
    private rewriteKbityUrl(url: URL): URL {
        if (url.hostname === 'kbity.catflare.cloud') {
            // Well this one is interesting. We used to use kbity.catflare.cloud but the domain owner
            // had a mental breakdown and deleted the sub-domain entry in the DNS.
            // So we use catfla.re instead which I finally fully own.
            const newUrl = new URL(url.toString());
            newUrl.hostname = 'catfla.re';
            return newUrl;
        }
        return url;
    }

    /**
     * Proxies a file from a remote URL.
     * Enforces MAX_FILE_SIZE_BYTES to prevent resource exhaustion.
     */
    @Get()
    @Response<ErrorResponse>('400', 'Bad Request', {
        error: ErrorMessages.FILE.URL_REQUIRED,
    })
    @Response<ErrorResponse>('413', 'File size exceeds limit', {
        error: ErrorMessages.FILE.SIZE_EXCEEDS_LIMIT,
    })
    @Response<ErrorResponse>('502', 'Bad Gateway', {
        error: ErrorMessages.FILE.FAILED_DOWNLOAD_REMOTE,
    })
    public async proxyFile(
        @Query() url: string,
        @Request() req: express.Request,
    ): Promise<void> {
        const res = req.res;
        if (!res) throw new Error(ErrorMessages.SYSTEM.RESPONSE_NOT_FOUND);

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
            res.status(500).json({ error: ErrorMessages.FILE.FAILED_PROXY });
        }
    }

    /**
     * Retrieves metadata for a remote file via HEAD request.
     */
    @Get('meta')
    @Response<ErrorResponse>('400', 'Bad Request', {
        error: ErrorMessages.FILE.URL_REQUIRED,
    })
    public async getFileMeta(@Query() url: string): Promise<any> {
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
                    this.setStatus(400);
                    throw err;
                }
            }

            this.logger.error('Failed to fetch metadata:', err);
            this.setStatus(500);
            throw new Error(ErrorMessages.FILE.FAILED_FETCH_META);
        }
    }
}
