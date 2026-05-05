import {
    Controller,
    Get,
    Post,
    Param,
    Req,
    Res,
    UseGuards,
    Inject,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TYPES } from '@/di/types';
import { injectable } from 'inversify';
import { ExportService } from '@/services/ExportService';
import { PermissionService } from '@/permissions/PermissionService';
import { Request, Response } from 'express';
import { JWTPayload } from '@/utils/jwt';
import { ApiError } from '@/utils/ApiError';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import type { IExportJobRepository } from '@/di/interfaces/IExportJobRepository';
import fs from 'fs';

@injectable()
@Controller('api/v1')
@ApiTags('Export')
export class ExportController {
    public constructor(
        @Inject(TYPES.ExportService)
        private exportService: ExportService,
        @Inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @Inject(TYPES.ExportJobRepository)
        private exportJobRepo: IExportJobRepository,
    ) {}

    @Get('servers/:serverId/channels/:channelId/export-state')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get export state for a channel' })
    public async getExportState(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Req() req: Request,
    ) {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const channelOid = new Types.ObjectId(channelId);
        const userOid = new Types.ObjectId(userId);

        if (
            (await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'export_channel_messages',
            )) !== true
        ) {
            throw new ApiError(
                403,
                'You do not have permission to export messages',
            );
        }

        return await this.exportService.getExportState(channelOid);
    }

    @Post('servers/:serverId/channels/:channelId/export')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Request message export for a channel' })
    public async requestExport(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Req() req: Request,
    ) {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const channelOid = new Types.ObjectId(channelId);
        const userOid = new Types.ObjectId(userId);

        if (
            (await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'export_channel_messages',
            )) !== true
        ) {
            throw new ApiError(
                403,
                'You do not have permission to export messages',
            );
        }

        try {
            const job = await this.exportService.requestExport(
                serverOid,
                channelOid,
                userOid,
            );
            return { message: 'Export started', jobId: job._id };
        } catch (err) {
            throw new ApiError(
                400,
                err instanceof Error ? err.message : 'Failed to request export',
            );
        }
    }

    @Get('exports/download/:token')
    @ApiOperation({ summary: 'Download exported file' })
    public async downloadExport(
        @Param('token') token: string,
        @Res() res: Response,
    ) {
        const job = await this.exportJobRepo.findByDownloadToken(token);

        if (job === null || job.status !== 'completed' || job.filePath === undefined || job.filePath === '') {
            return this.sendExpiredResponse(res, 404);
        }

        if (job.expiresAt !== undefined && new Date() > job.expiresAt) {
            return this.sendExpiredResponse(res, 410);
        }


        const path = await import('path');
        const EXPORT_DIR = path.resolve(process.cwd(), 'uploads', 'exports');
        const resolvedPath = path.resolve(job.filePath);
        if (!resolvedPath.startsWith(EXPORT_DIR + path.sep)) {
            return res.status(403).send('Forbidden');
        }

        if (fs.existsSync(resolvedPath) === false) {
            return res.status(404).send('File not found');
        }

        res.download(resolvedPath, `channel-${job.channelId}.json`);
    }

    private sendExpiredResponse(res: Response, status: number) {
        return res.status(status).send(`
            <!DOCTYPE html>
            <html>
            <head><title>Link Expired</title></head>
            <body>
                <h1>This download link has expired. Please return to the home page.</h1>
                <a href="/">Go to Home Page</a>
            </body>
            </html>
        `);
    }
}
