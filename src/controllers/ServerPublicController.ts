import {
    Controller,
    Get,
    Param,
    Res,
    BadRequestException,
    NotFoundException,
    Inject,
    StreamableFile,
    Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { injectable } from 'inversify';
import { TYPES } from '@/di/types';
import type { ILogger } from '@/di/interfaces/ILogger';
import { ImageDeliveryService } from '@/services/ImageDeliveryService';
import path from 'path';
import fs from 'fs';
import { ErrorMessages } from '@/constants/errorMessages';
import { Request, Response } from 'express';

// Controller for serving public server assets
@injectable()
@Controller('api/v1/servers')
@ApiTags('Servers (Public)')
export class ServerPublicController {
    private readonly UPLOADS_DIR = path.join(
        process.cwd(),
        'uploads',
        'servers',
    );

    constructor(
        @Inject(TYPES.Logger)
        private logger: ILogger,
        @Inject(TYPES.ImageDeliveryService)
        private imageDeliveryService: ImageDeliveryService,
    ) {}

    // Serves a server icon file
    @Get('icon/:filename')
    @ApiOperation({ summary: 'Get server icon' })
    @ApiResponse({ status: 200, description: 'Icon file retrieved' })
    @ApiResponse({ status: 404, description: ErrorMessages.FILE.NOT_FOUND })
    public async getServerIcon(
        @Param('filename') filename: string,
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ): Promise<StreamableFile> {
        // Strict filename validation to prevent directory traversal attacks
        if (
            !filename ||
            filename.includes('..') ||
            filename.includes('/') ||
            filename.includes('\\')
        ) {
            throw new BadRequestException(ErrorMessages.FILE.INVALID_FILENAME);
        }

        const filepath = path.join(this.UPLOADS_DIR, filename);

        if (!fs.existsSync(filepath)) {
            throw new NotFoundException(ErrorMessages.FILE.NOT_FOUND);
        }

        const { buffer, contentType, contentLength } =
            await this.imageDeliveryService.getProcessedImage(
                filepath,
                req.headers.accept,
            );

        res.set({
            'Content-Type': contentType,
            'Content-Length': contentLength,
            'Cache-Control': 'public, max-age=31536000, immutable',
        });

        return new StreamableFile(buffer);
    }

    // Serves a server banner file
    @Get('banner/:filename')
    @ApiOperation({ summary: 'Get server banner' })
    @ApiResponse({ status: 200, description: 'Banner file retrieved' })
    @ApiResponse({ status: 404, description: ErrorMessages.FILE.NOT_FOUND })
    public async getServerBanner(
        @Param('filename') filename: string,
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ): Promise<StreamableFile> {
        // Strict filename validation to prevent directory traversal attacks
        if (
            !filename ||
            filename.trim() === '' ||
            filename.includes('..') ||
            filename.includes('/') ||
            filename.includes('\\')
        ) {
            throw new BadRequestException(ErrorMessages.FILE.INVALID_FILENAME);
        }

        const filepath = path.resolve(this.UPLOADS_DIR, filename);

        // Ensure the resolved path is within the intended uploads directory
        if (!filepath.startsWith(this.UPLOADS_DIR + path.sep)) {
            throw new BadRequestException(ErrorMessages.FILE.INVALID_FILENAME);
        }

        if (!fs.existsSync(filepath)) {
            throw new NotFoundException(ErrorMessages.FILE.NOT_FOUND);
        }

        const { buffer, contentType, contentLength } =
            await this.imageDeliveryService.getProcessedImage(
                filepath,
                req.headers.accept,
            );

        res.set({
            'Content-Type': contentType,
            'Content-Length': contentLength,
            'Cache-Control': 'public, max-age=31536000, immutable',
        });

        return new StreamableFile(buffer);
    }
}
