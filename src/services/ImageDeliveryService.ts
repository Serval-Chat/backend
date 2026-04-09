import { injectable, inject } from 'inversify';
import { Injectable, Inject } from '@nestjs/common';
import { TYPES } from '@/di/types';
import type { ILogger } from '@/di/interfaces/ILogger';
import type { IRedisService } from '@/di/interfaces/IRedisService';
import { processImage } from '@/utils/imageProcessing';
import path from 'path';
import fs from 'fs';
import { Buffer } from 'buffer';
import crypto from 'crypto';

@injectable()
@Injectable()
export class ImageDeliveryService {
    private readonly CACHE_PREFIX = 'img_conv:webp:';
    private readonly CACHE_TTL = 86400; // 24 hours

    constructor(
        @inject(TYPES.Logger) @Inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.RedisService)
        @Inject(TYPES.RedisService)
        private redisService: IRedisService,
    ) {}

    /**
     * Processes an image and returns a WebP buffer if supported by the client.
     * @param filePath Path to the original file on disk
     * @param acceptHeader The 'Accept' header from the request
     * @returns Object containing the buffer, content type, and length
     */
    public async getProcessedImage(
        filePath: string,
        acceptHeader: string = '',
    ): Promise<{ buffer: Buffer; contentType: string; contentLength: number }> {
        const ext = path.extname(filePath).toLowerCase();
        const stats = await fs.promises.stat(filePath);

        // Only convert PNG and JPEG to WebP for now. GIF is handled separately if needed.
        const isConvertible =
            ext === '.png' || ext === '.jpg' || ext === '.jpeg';
        const supportsWebp = acceptHeader.includes('image/webp');

        if (!isConvertible || !supportsWebp) {
            const buffer = await fs.promises.readFile(filePath);
            return {
                buffer,
                contentType: this.getMimeType(ext),
                contentLength: stats.size,
            };
        }

        // Try to get from cache
        const cacheKey = `${this.CACHE_PREFIX}${this.getCacheKey(filePath, stats.mtimeMs)}`;
        const cached = await this.redisService.getClient().getBuffer(cacheKey);

        if (cached) {
            return {
                buffer: cached,
                contentType: 'image/webp',
                contentLength: cached.length,
            };
        }

        // Convert to WebP
        try {
            const originalBuffer = await fs.promises.readFile(filePath);
            const { buffer: processedBuffer } = await processImage(
                originalBuffer,
                {
                    format: 'webp',
                    quality: 85,
                    effort: 6,
                    stripMetadata: true,
                },
            );

            // Cache the result
            await this.redisService
                .getClient()
                .set(cacheKey, processedBuffer, 'EX', this.CACHE_TTL);

            return {
                buffer: processedBuffer,
                contentType: 'image/webp',
                contentLength: processedBuffer.length,
            };
        } catch (err) {
            this.logger.error(
                `[ImageDeliveryService] Failed to convert image ${filePath} to WebP:`,
                err,
            );
            // Fallback to original
            const buffer = await fs.promises.readFile(filePath);
            return {
                buffer,
                contentType: this.getMimeType(ext),
                contentLength: stats.size,
            };
        }
    }

    /**
     * Processes a remote buffer (from proxy) to WebP if supported.
     */
    public async processRemoteImage(
        buffer: Buffer,
        originalMimeType: string,
        acceptHeader: string = '',
        cacheKeySuffix: string,
    ): Promise<{ buffer: Buffer; contentType: string }> {
        const supportsWebp = acceptHeader.includes('image/webp');
        const isConvertible =
            originalMimeType === 'image/png' ||
            originalMimeType === 'image/jpeg';

        if (!supportsWebp || !isConvertible) {
            return { buffer, contentType: originalMimeType };
        }

        const cacheKey = `${this.CACHE_PREFIX}proxy:${cacheKeySuffix}`;
        const cached = await this.redisService.getClient().getBuffer(cacheKey);

        if (cached) {
            return { buffer: cached, contentType: 'image/webp' };
        }

        try {
            const { buffer: processedBuffer } = await processImage(buffer, {
                format: 'webp',
                quality: 85,
                effort: 6,
                stripMetadata: true,
            });

            await this.redisService
                .getClient()
                .set(cacheKey, processedBuffer, 'EX', this.CACHE_TTL);

            return { buffer: processedBuffer, contentType: 'image/webp' };
        } catch (err) {
            this.logger.error(
                '[ImageDeliveryService] Failed to convert remote image to WebP:',
                err,
            );
            return { buffer, contentType: originalMimeType };
        }
    }

    private getCacheKey(filePath: string, mtime: number): string {
        // Use a hash of the path and modification time for a consistent, short, and unique key
        return crypto
            .createHash('md5')
            .update(`${filePath}:${mtime}`)
            .digest('hex');
    }

    private getMimeType(ext: string): string {
        const mimes: Record<string, string> = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
        };
        return mimes[ext] || 'application/octet-stream';
    }
}
