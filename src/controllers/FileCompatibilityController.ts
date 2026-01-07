import { Controller, Get, Param, Req, Res, Inject } from '@nestjs/common';
import { TYPES } from '@/di/types';
import { ILogger } from '@/di/interfaces/ILogger';
import { ApiTags, ApiResponse, ApiOperation } from '@nestjs/swagger';
import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { extractOriginalFilename } from '@/config/multer';
import { ErrorMessages } from '@/constants/errorMessages';
import { ApiError } from '@/utils/ApiError';
import { injectable, inject } from 'inversify';

// Compatibility controller for file downloads
// Provides the legacy /api/v1/download/:filename endpoint
@ApiTags('Files')
@injectable()
@Controller('api/v1')
export class FileCompatibilityController {
    constructor(
        @inject(TYPES.Logger)
        @Inject(TYPES.Logger)
        private logger: ILogger,
    ) {}

    @Get('download/:filename')
    @ApiOperation({ summary: 'Download a file (legacy)' })
    @ApiResponse({ status: 200, description: 'File stream' })
    @ApiResponse({ status: 400, description: 'Invalid filename' })
    @ApiResponse({ status: 404, description: 'File not found' })
    public async downloadFile(
        @Param('filename') filename: string,
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<void> {
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

        fileStream.pipe(res);
        fileStream.on('error', (err) => {
            this.logger.error('Stream error:', err);
            if (!res.headersSent) {
                res.status(500).json({
                    error: ErrorMessages.FILE.FAILED_STREAM,
                });
            }
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
