import { Controller, Get, Route, Tags, Path, Request, Response } from 'tsoa';
import { injectable, inject } from 'inversify';
import { TYPES } from '@/di/types';
import type { ILogger } from '@/di/interfaces/ILogger';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { extractOriginalFilename } from '@/config/multer';
import { ErrorResponse } from '@/controllers/models/ErrorResponse';
import { ErrorMessages } from '@/constants/errorMessages';
import { ApiError } from '@/utils/ApiError';

// Compatibility controller for file downloads
// Provides the legacy /api/v1/download/:filename endpoint
@injectable()
@Route('api/v1')
@Tags('Files')
export class FileCompatibilityController extends Controller {
    constructor(@inject(TYPES.Logger) private logger: ILogger) {
        super();
    }

    // Downloads a file with its original filename (legacy endpoint)
    @Get('download/{filename}')
    @Response<ErrorResponse>('400', 'Invalid filename', {
        error: ErrorMessages.FILE.INVALID_FILENAME,
    })
    @Response<ErrorResponse>('404', 'File not found', {
        error: ErrorMessages.FILE.NOT_FOUND,
    })
    public async downloadFile(
        @Path() filename: string,
        @Request() req: express.Request,
    ): Promise<void> {
        const res = req.res;
        if (!res) throw new ApiError(500, ErrorMessages.SYSTEM.RESPONSE_NOT_FOUND);

        const safeFilename = path.basename(filename);
        if (safeFilename !== filename) {
            throw new ApiError(400, ErrorMessages.FILE.INVALID_FILENAME);
        }

        const uploadsDir = path.join(process.cwd(), 'uploads', 'uploads');
        const filePath = path.join(uploadsDir, safeFilename);

        if (!fs.existsSync(filePath)) {
            throw new ApiError(404, ErrorMessages.FILE.NOT_FOUND);
        }

        // Verify the resolved path is still within uploads directory
        const realPath = fs.realpathSync(filePath);
        const realUploadsDir = fs.realpathSync(uploadsDir);

        if (!realPath.startsWith(realUploadsDir)) {
            throw new ApiError(400, ErrorMessages.FILE.INVALID_PATH);
        }

        const isNewFormat = /^[a-f0-9]{20}-.+$/.test(safeFilename);
        const originalFilename = isNewFormat
            ? extractOriginalFilename(safeFilename)
            : safeFilename;

        // Escape quotes and backslashes for Content-Disposition header
        const escapedFilename = originalFilename.replace(/["\\]/g, '\\$&');
        const encodedFilename = encodeURIComponent(originalFilename);

        const ext = path.extname(originalFilename).toLowerCase();
        const stats = fs.statSync(filePath);
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${escapedFilename}"; filename*=UTF-8''${encodedFilename}`,
        );
        res.setHeader('Content-Length', stats.size);
        res.setHeader('Content-Type', this.getMimeType(ext));

        const fileStream = fs.createReadStream(filePath);

        return new Promise((resolve, reject) => {
            fileStream.pipe(res);
            fileStream.on('end', () => {
                resolve();
            });
            fileStream.on('error', (err) => {
                this.logger.error('Stream error:', err);
                if (!res.headersSent) {
                    res.status(500).json({
                        error: ErrorMessages.FILE.FAILED_STREAM,
                    });
                }
                reject(err);
            });
        });
    }

    private getMimeType(ext: string): string {
        const mimeTypes: { [key: string]: string } = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
            '.mp4': 'video/mp4',
            '.webm': 'video/webm',
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.pdf': 'application/pdf',
            '.txt': 'text/plain',
        };
        return mimeTypes[ext] || 'application/octet-stream';
    }
}
