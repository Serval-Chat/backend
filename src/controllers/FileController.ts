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
import { ImageDeliveryService } from '@/services/ImageDeliveryService';
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
import fs, { promises as fsPromises } from 'fs';
import mime from 'mime-types';
import { SERVER_URL } from '@/config/env';
import { extractOriginalFilename, storage } from '@/config/multer';
import { ErrorMessages } from '@/constants/errorMessages';
import { ApiError } from '@/utils/ApiError';
import {
    FileUploadResponseDTO,
    FileMetadataResponseDTO,
} from './dto/file.response.dto';
import { injectable } from 'inversify';
import { isText } from 'istextorbinary';

@ApiTags('Files')
@injectable()
@Controller('api/v1/files')
export class FileController {
    private readonly uploadsDir = path.join(
        process.cwd(),
        'uploads',
        'uploads',
    );

    public constructor(
        @Inject(TYPES.Logger)
        private logger: ILogger,
        @Inject(TYPES.ImageDeliveryService)
        private imageDeliveryService: ImageDeliveryService,
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
        const filePath = await this.getFilePath(filename);
        const stats = await fsPromises.stat(filePath);
        const originalFilename = this.getOriginalFilename(filename);

        let isBinary = false;
        try {
            const buffer = Buffer.alloc(Math.min(4096, stats.size));
            const handle = await fsPromises.open(filePath, 'r');
            await handle.read(buffer, 0, buffer.length, 0);
            await handle.close();
            isBinary = isText(filename, buffer) === false;
        } catch (err: unknown) {
            this.logger.error('Error detecting binary:', err);
            isBinary = true;
        }

        return {
            filename: originalFilename,
            size: stats.size,
            isBinary,
            mimeType: await this.getMimeType(originalFilename),
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
        const filePath = await this.getFilePath(filename);
        const originalFilename = this.getOriginalFilename(filename);

        const escapedFilename = originalFilename.replace(/["\\]/g, '\\$&');
        const encodedFilename = encodeURIComponent(originalFilename);

        const { buffer, contentType, contentLength } =
            await this.imageDeliveryService.getProcessedImage(
                filePath,
                req.headers.accept,
            );

        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${escapedFilename}"; filename*=UTF-8''${encodedFilename}`,
        );
        res.setHeader('Content-Length', contentLength);
        res.setHeader('Content-Type', contentType);

        res.send(buffer);
    }

    /**
     * Extracts the original filename from a stored filename.
     * Handles both new format (hash-prefixed) and legacy format.
     * @param filename Stored filename
     * @returns Original filename
     */
    private getOriginalFilename(filename: string): string {
        const safeFilename = path.basename(filename);
        const isNewFormat = /^[a-f0-9]{20}-.+$/.test(safeFilename);
        return isNewFormat
            ? extractOriginalFilename(safeFilename)
            : safeFilename;
    }

    /**
     * Resolves a filename to its full path and validates its existence.
     * @param filename User-provided filename
     * @returns Full path to the file
     * @throws ApiError if filename is invalid or file doesn't exist
     */
    private async getFilePath(filename: string): Promise<string> {
        const safeFilename = path.basename(filename);
        if (safeFilename !== filename) {
            throw new ApiError(400, 'Invalid filename');
        }

        const filePath = path.join(this.uploadsDir, safeFilename);

        const resolvedPath = path.resolve(filePath);
        const resolvedUploadsDir = path.resolve(this.uploadsDir);

        if (!resolvedPath.startsWith(resolvedUploadsDir)) {
            throw new ApiError(400, 'Invalid filename');
        }

        try {
            await fsPromises.access(filePath, fs.constants.F_OK);
        } catch {
            throw new ApiError(404, ErrorMessages.FILE.NOT_FOUND);
        }

        return filePath;
    }

    /**
     * Determines the MIME type of a file based on its filename.
     * @param filename File name with extension
     * @returns MIME type string, defaults to 'application/octet-stream'
     */
    private async getMimeType(filename: string): Promise<string> {
        const mimeType = mime.lookup(filename);

        if (typeof mimeType === 'string' && mimeType !== '') {
            return mimeType;
        }

        // If mime-types doesn't recognize it, check if it's binary using istextorbinary
        const filePath = path.join(this.uploadsDir, path.basename(filename));

        try {
            const stats = await fsPromises.stat(filePath);
            const buffer = Buffer.alloc(Math.min(4096, stats.size));
            const handle = await fsPromises.open(filePath, 'r');
            await handle.read(buffer, 0, buffer.length, 0);
            await handle.close();

            return isText(filename, buffer) === true
                ? 'text/plain'
                : 'application/octet-stream';
        } catch (err: unknown) {
            this.logger.error('Error detecting mime type:', err);
            return 'application/octet-stream';
        }
    }

    /**
     * Gets the Content-Type header value for a file, including charset if available.
     * @param filename File name with extension
     * @returns Content-Type string, defaults to 'application/octet-stream'
     */
    private getContentType(filename: string): string {
        const contentType = mime.contentType(filename);
        return typeof contentType === 'string' && contentType !== ''
            ? contentType
            : 'application/octet-stream';
    }
}
