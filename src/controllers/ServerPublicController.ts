import {
    Controller,
    Get,
    Param,
    Res,
    BadRequestException,
    NotFoundException,
    Inject,
    StreamableFile,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { injectable, inject } from 'inversify';
import { TYPES } from '@/di/types';
import type { ILogger } from '@/di/interfaces/ILogger';
import path from 'path';
import fs from 'fs';
import { ErrorMessages } from '@/constants/errorMessages';
import type { Response } from 'express';

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
        @inject(TYPES.Logger)
        @Inject(TYPES.Logger)
        private logger: ILogger,
    ) { }

    // Serves a server icon file
    @Get('icon/:filename')
    @ApiOperation({ summary: 'Get server icon' })
    @ApiResponse({ status: 200, description: 'Icon file retrieved' })
    @ApiResponse({ status: 404, description: ErrorMessages.FILE.NOT_FOUND })
    public async getServerIcon(
        @Param('filename') filename: string,
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

        const ext = path.extname(filename).toLowerCase();
        if (ext === '.gif') {
            res.set({
                'Content-Type': 'image/gif',
            });
        } else {
            res.set({
                'Content-Type': 'image/png',
            });
        }

        const file = fs.createReadStream(filepath);
        return new StreamableFile(file);
    }

    // Serves a server banner file
    @Get('banner/:filename')
    @ApiOperation({ summary: 'Get server banner' })
    @ApiResponse({ status: 200, description: 'Banner file retrieved' })
    @ApiResponse({ status: 404, description: ErrorMessages.FILE.NOT_FOUND })
    public async getServerBanner(
        @Param('filename') filename: string,
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

        const ext = path.extname(filename).toLowerCase();
        if (ext === '.gif') {
            res.set({
                'Content-Type': 'image/gif',
            });
        } else {
            res.set({
                'Content-Type': 'image/png',
            });
        }

        const file = fs.createReadStream(filepath);
        return new StreamableFile(file);
    }
}
