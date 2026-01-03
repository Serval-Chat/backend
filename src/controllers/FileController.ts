import {
    Controller,
    Get,
    Post,
    Route,
    Tags,
    Path,
    Request,
    Response,
    Security,
    UploadedFile,
} from 'tsoa';
import { injectable, inject } from 'inversify';
import { TYPES } from '@/di/types';
import type { ILogger } from '@/di/interfaces/ILogger';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { SERVER_URL } from '@/config/env';
import { extractOriginalFilename } from '@/config/multer';
import { ErrorResponse } from '@/controllers/models/ErrorResponse';
import { ErrorMessages } from '@/constants/errorMessages';

import {
    FileUploadResponseDTO,
    FileMetadataResponseDTO,
} from './dto/file.response.dto';

// Controller for file uploads, metadata retrieval, and downloads
@injectable()
@Route('api/v1/files')
@Tags('Files')
export class FileController extends Controller {
    constructor(@inject(TYPES.Logger) private logger: ILogger) {
        super();
    }

    // Uploads a file and returns a download URL
    // Expects a multipart/form-data request with a 'file' field
    @Post('upload')
    @Security('jwt')
    public async uploadFile(
        @UploadedFile() file: Express.Multer.File,
        @Request() _req: express.Request,
    ): Promise<FileUploadResponseDTO> {
        if (!file) {
            this.setStatus(400);
            throw new Error(ErrorMessages.FILE.NO_FILE_UPLOADED);
        }

        const fileUrl = `${SERVER_URL}/api/v1/files/download/${file.filename}`;
        return { url: fileUrl };
    }

    // Retrieves file metadata without downloading the content
    @Get('metadata/{filename}')
    @Response<ErrorResponse>('400', 'Invalid filename', {
        error: ErrorMessages.FILE.INVALID_FILENAME,
    })
    @Response<ErrorResponse>('404', 'File not found', {
        error: ErrorMessages.FILE.NOT_FOUND,
    })
    public async getFileMetadata(
        @Path() filename: string,
    ): Promise<FileMetadataResponseDTO> {
        try {
            if (!filename) {
                this.setStatus(400);
                throw new Error(ErrorMessages.FILE.FILENAME_REQUIRED);
            }

            // Prevent directory traversal
            const safeFilename = path.basename(filename);

            if (safeFilename !== filename) {
                this.setStatus(400);
                throw new Error(ErrorMessages.FILE.INVALID_FILENAME);
            }

            const uploadsDir = path.join(process.cwd(), 'uploads', 'uploads');
            const filePath = path.join(uploadsDir, safeFilename);

            // Verify the resolved path is within the uploads directory
            const realPath = fs.realpathSync(filePath);
            const realUploadsDir = fs.realpathSync(uploadsDir);

            if (!realPath.startsWith(realUploadsDir)) {
                this.setStatus(400);
                throw new Error(ErrorMessages.FILE.INVALID_PATH);
            }

            if (!fs.existsSync(filePath)) {
                this.setStatus(404);
                throw new Error(ErrorMessages.FILE.NOT_FOUND);
            }

            const stats = fs.statSync(filePath);

            // Extract original filename based on storage format
            const isNewFormat = /^[a-f0-9]{20}-.+$/.test(filename);
            const originalFilename = isNewFormat
                ? extractOriginalFilename(filename)
                : filename;

            // Detect binary content by checking for null bytes in the first 8KiB
            let isBinary = false;
            try {
                const buffer = Buffer.alloc(Math.min(8192, stats.size));
                const fd = fs.openSync(filePath, 'r');
                fs.readSync(fd, buffer, 0, buffer.length, 0);
                fs.closeSync(fd);
                isBinary = buffer.includes(0);
            } catch (err) {
                this.logger.error('Error detecting binary:', err);
                isBinary = true;
            }

            const ext = path.extname(originalFilename).toLowerCase();
            const mimeType = this.getMimeType(ext);

            return {
                filename: originalFilename,
                size: stats.size,
                isBinary,
                mimeType,
                createdAt: stats.birthtime,
                modifiedAt: stats.mtime,
            };
        } catch (err: any) {
            if (
                err.message === ErrorMessages.FILE.NOT_FOUND ||
                err.message === ErrorMessages.FILE.INVALID_FILENAME ||
                err.message === ErrorMessages.FILE.INVALID_PATH
            ) {
                throw err;
            }
            this.logger.error('Metadata error:', err);
            this.setStatus(500);
            throw new Error(ErrorMessages.FILE.FAILED_METADATA);
        }
    }

    // Downloads a file with its original filename
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

            const realPath = fs.realpathSync(filePath);
            const realUploadsDir = fs.realpathSync(uploadsDir);

            if (!realPath.startsWith(realUploadsDir)) {
                res.status(400).json({
                    error: ErrorMessages.FILE.INVALID_PATH,
                });
                return;
            }

            if (!fs.existsSync(filePath)) {
                res.status(404).json({ error: ErrorMessages.FILE.NOT_FOUND });
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
