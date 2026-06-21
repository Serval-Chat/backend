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
import {
    ApiTags,
    ApiOperation,
    ApiOkResponse,
    ApiProduces,
    ApiBearerAuth,
} from '@nestjs/swagger';
import { TYPES } from '@/di/types';
import {
    ExportStateResponseDTO,
    ExportRequestResponseDTO,
} from '@/controllers/dto/export.response.dto';
import { ExportService } from '@/services/ExportService';
import { PermissionService } from '@/permissions/PermissionService';
import { Request, Response } from 'express';
import { JWTPayload } from '@/utils/jwt';
import { CurrentUser } from '@/modules/auth/current-user.decorator';
import { ApiError } from '@/utils/ApiError';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import type { IExportJobRepository } from '@/di/interfaces/IExportJobRepository';
import fs from 'fs';
import { getDocumentIdString } from '@/utils/mongooseId';

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
    @ApiOkResponse({ type: ExportStateResponseDTO })
    public async getExportState(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @CurrentUser('id') userId: string,
    ) {
        const serverOid = new Types.ObjectId(serverId);
        const channelOid = new Types.ObjectId(channelId);
        const userOid = new Types.ObjectId(userId);

        await this.permissionService.requirePermission(
            serverOid,
            userOid,
            'exportChannelMessages',
            new ApiError(403, 'You do not have permission to export messages'),
        );

        return await this.exportService.getExportState(channelOid);
    }

    @Post('servers/:serverId/channels/:channelId/export')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Request message export for a channel' })
    @ApiOkResponse({ type: ExportRequestResponseDTO })
    public async requestExport(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @CurrentUser('id') userId: string,
    ) {
        const serverOid = new Types.ObjectId(serverId);
        const channelOid = new Types.ObjectId(channelId);
        const userOid = new Types.ObjectId(userId);

        await this.permissionService.requirePermission(
            serverOid,
            userOid,
            'exportChannelMessages',
            new ApiError(403, 'You do not have permission to export messages'),
        );

        try {
            const job = await this.exportService.requestExport(
                serverOid,
                channelOid,
                userOid,
            );
            return {
                message: 'Export started',
                jobId: getDocumentIdString(job),
            };
        } catch (err) {
            throw new ApiError(
                400,
                err instanceof Error ? err.message : 'Failed to request export',
            );
        }
    }

    @Get('exports/download/:token')
    @ApiOperation({ summary: 'Download exported file' })
    @ApiOkResponse({ type: String, description: 'Export JSON file' })
    @ApiProduces('application/json')
    public async downloadExport(
        @Param('token') token: string,
        @Res() res: Response,
    ) {
        const job = await this.exportJobRepo.findByDownloadToken(token);

        if (
            job === null ||
            job.status !== 'completed' ||
            job.filePath === undefined ||
            job.filePath === ''
        ) {
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
