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
import { ApiError } from '@/utils/ApiError';

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
            throw new ApiError(400, ErrorMessages.FILE.NO_FILE_UPLOADED);
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
        const safeFilename = path.basename(filename);
        if (safeFilename !== filename) {
            throw new ApiError(400, 'Invalid filename');
        }

        const uploadsDir = path.join(process.cwd(), 'uploads', 'uploads');
        const filePath = path.join(uploadsDir, safeFilename);

        if (!fs.existsSync(filePath)) {
            throw new ApiError(404, ErrorMessages.FILE.NOT_FOUND);
        }

        const stats = fs.statSync(filePath);
        const isNewFormat = /^[a-f0-9]{20}-.+$/.test(safeFilename);
        const originalFilename = isNewFormat
            ? extractOriginalFilename(safeFilename)
            : safeFilename;

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
        if (!res) throw new ApiError(500, 'Response object not found');

        const safeFilename = path.basename(filename);
        if (safeFilename !== filename) {
            throw new ApiError(400, 'Invalid filename');
        }

        const uploadsDir = path.join(process.cwd(), 'uploads', 'uploads');
        const filePath = path.join(uploadsDir, safeFilename);

        if (!fs.existsSync(filePath)) {
            throw new ApiError(404, ErrorMessages.FILE.NOT_FOUND);
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
