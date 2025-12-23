import {
    Controller,
    Get,
    Route,
    Tags,
    Path,
    Request,
    Response,
} from 'tsoa';
import { injectable, inject } from 'inversify';
import { TYPES } from '../di/types';
import type { ILogger } from '../di/interfaces/ILogger';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { extractOriginalFilename } from '../config/multer';
import { ErrorResponse } from './models/ErrorResponse';
import { ErrorMessages } from '../constants/errorMessages';

/**
 * Compatibility controller for file downloads.
 * Provides the legacy /api/v1/download/:filename endpoint.
 */
@injectable()
@Route('api/v1')
@Tags('Files')
export class FileCompatibilityController extends Controller {
    constructor(@inject(TYPES.Logger) private logger: ILogger) {
        super();
    }

    /**
     * Downloads a file with its original filename (Legacy endpoint).
     */
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
        if (!res) throw new Error(ErrorMessages.SYSTEM.RESPONSE_NOT_FOUND);

        try {
            if (!filename) {
                res.status(400).json({
                    error: ErrorMessages.FILE.FILENAME_REQUIRED,
                });
                return;
            }

            const safeFilename = path.basename(filename);
            if (safeFilename !== filename) {
                res.status(400).json({
                    error: ErrorMessages.FILE.INVALID_FILENAME,
                });
                return;
            }

            const uploadsDir = path.join(process.cwd(), 'uploads', 'uploads');
            const filePath = path.join(uploadsDir, safeFilename);

            if (!fs.existsSync(filePath)) {
                res.status(404).json({ error: ErrorMessages.FILE.NOT_FOUND });
                return;
            }

            // Verify the resolved path is still within uploads directory
            const realPath = fs.realpathSync(filePath);
            if (!realPath.startsWith(uploadsDir)) {
                res.status(400).json({
                    error: ErrorMessages.FILE.INVALID_PATH,
                });
                return;
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
        } catch (err) {
            this.logger.error('Download error:', err);
            res.status(500).json({ error: ErrorMessages.FILE.FAILED_DOWNLOAD });
        }
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
