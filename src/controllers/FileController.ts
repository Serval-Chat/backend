import {
    Controller,
    Get,
    Post,
    Param,
    Req,
    Res,
    UseGuards,
    UseInterceptors,
    UploadedFile,
    Inject,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TYPES } from '@/di/types';
import { ILogger } from '@/di/interfaces/ILogger';
import {
    ApiTags,
    ApiResponse,
    ApiBearerAuth,
    ApiOperation,
    ApiConsumes,
    ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { SERVER_URL } from '@/config/env';
import { extractOriginalFilename, storage } from '@/config/multer';
import { ErrorMessages } from '@/constants/errorMessages';
import { ApiError } from '@/utils/ApiError';
import {
    FileUploadResponseDTO,
    FileMetadataResponseDTO,
} from './dto/file.response.dto';
import { injectable, inject } from 'inversify';

// Controller for file uploads, metadata retrieval, and downloads
@ApiTags('Files')
@injectable()
@Controller('api/v1/files')
export class FileController {
    constructor(
        @inject(TYPES.Logger)
        @Inject(TYPES.Logger)
        private logger: ILogger,
    ) {}

    @Post('upload')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @UseInterceptors(FileInterceptor('file', { storage }))
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                },
            },
        },
    })
    @ApiOperation({ summary: 'Upload a file' })
    @ApiResponse({ status: 201, type: FileUploadResponseDTO })
    public async uploadFile(
        @UploadedFile() file: Express.Multer.File,
        @Req() _req: Request,
    ): Promise<FileUploadResponseDTO> {
        if (!file) {
            throw new ApiError(400, ErrorMessages.FILE.NO_FILE_UPLOADED);
        }

        const fileUrl = `${SERVER_URL}/api/v1/files/download/${file.filename}`;
        return { url: fileUrl };
    }

    @Get('metadata/:filename')
    @ApiOperation({ summary: 'Get file metadata' })
    @ApiResponse({ status: 200, type: FileMetadataResponseDTO })
    @ApiResponse({ status: 400, description: 'Invalid filename' })
    @ApiResponse({ status: 404, description: 'File not found' })
    public async getFileMetadata(
        @Param('filename') filename: string,
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

    @Get('download/:filename')
    @ApiOperation({ summary: 'Download a file' })
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
