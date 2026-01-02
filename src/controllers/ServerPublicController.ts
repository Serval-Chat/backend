import { Controller, Get, Route, Path, Response, Tags } from 'tsoa';
import { injectable, inject } from 'inversify';
import { TYPES } from '@/di/types';
import type { ILogger } from '@/di/interfaces/ILogger';
import path from 'path';
import fs from 'fs';
import { ErrorResponse } from '@/controllers/models/ErrorResponse';
import { ErrorMessages } from '@/constants/errorMessages';

// Controller for serving public server assets
@injectable()
@Route('api/v1/servers')
@Tags('Servers (Public)')
export class ServerPublicController extends Controller {
    private readonly UPLOADS_DIR = path.join(
        process.cwd(),
        'uploads',
        'servers',
    );

    constructor(@inject(TYPES.Logger) private logger: ILogger) {
        super();
    }

    // Serves a server icon file
    @Get('icon/{filename}')
    @Response<ErrorResponse>('404', 'Icon Not Found', {
        error: ErrorMessages.FILE.NOT_FOUND,
    })
    public async getServerIcon(@Path() filename: string): Promise<any> {
        // Strict filename validation to prevent directory traversal attacks
        if (
            filename.includes('..') ||
            filename.includes('/') ||
            filename.includes('\\')
        ) {
            this.setStatus(400);
            const error = new Error(ErrorMessages.FILE.INVALID_FILENAME) as any;
            error.status = 400;
            throw error;
        }

        const filepath = path.join(this.UPLOADS_DIR, filename);

        if (!fs.existsSync(filepath)) {
            this.setStatus(404);
            const error = new Error(ErrorMessages.FILE.NOT_FOUND) as any;
            error.status = 404;
            throw error;
        }

        // TSOA doesn't have a built-in 'file' return type; we set headers manually and return a ReadStream
        const ext = path.extname(filename).toLowerCase();
        if (ext === '.gif') {
            this.setHeader('Content-Type', 'image/gif');
        } else {
            this.setHeader('Content-Type', 'image/png');
        }

        return fs.createReadStream(filepath);
    }

    // Serves a server banner file
    @Get('banner/{filename}')
    @Response<ErrorResponse>('404', 'Banner Not Found', {
        error: ErrorMessages.FILE.NOT_FOUND,
    })
    public async getServerBanner(@Path() filename: string): Promise<any> {
        // Strict filename validation to prevent directory traversal attacks
        if (
            !filename ||
            filename.trim() === '' ||
            filename.includes('..') ||
            filename.includes('/') ||
            filename.includes('\\')
        ) {
            this.setStatus(400);
            const error = new Error(ErrorMessages.FILE.INVALID_FILENAME) as any;
            error.status = 400;
            throw error;
        }

        const filepath = path.resolve(this.UPLOADS_DIR, filename);

        // Ensure the resolved path is within the intended uploads directory
        if (!filepath.startsWith(this.UPLOADS_DIR + path.sep)) {
            this.setStatus(400);
            const error = new Error(ErrorMessages.FILE.INVALID_FILENAME) as any;
            error.status = 400;
            throw error;
        }

        if (!fs.existsSync(filepath)) {
            this.setStatus(404);
            const error = new Error(ErrorMessages.FILE.NOT_FOUND) as any;
            error.status = 404;
            throw error;
        }

        const ext = path.extname(filename).toLowerCase();
        if (ext === '.gif') {
            this.setHeader('Content-Type', 'image/gif');
        } else {
            this.setHeader('Content-Type', 'image/png');
        }

        return fs.createReadStream(filepath);
    }
}
