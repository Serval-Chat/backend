import {
    Controller,
    Get,
    Delete,
    Route,
    Path,
    Security,
    Response,
    Tags,
    Request,
} from 'tsoa';
import { injectable, inject } from 'inversify';
import { TYPES } from '@/di/types';
import { PingService, type PingNotification } from '@/services/PingService';
import type { ILogger } from '@/di/interfaces/ILogger';
import express from 'express';
import { ErrorResponse } from '@/controllers/models/ErrorResponse';
import { ErrorMessages } from '@/constants/errorMessages';

// Controller for managing user pings (mentions and notifications)
@injectable()
@Route('api/v1/pings')
@Tags('Pings')
@Security('jwt')
export class UserPingController extends Controller {
    constructor(
        @inject(TYPES.PingService) private pingService: PingService,
        @inject(TYPES.Logger) private logger: ILogger,
    ) {
        super();
    }

    // Get all pings for the current user
    @Get()
    public async getPings(
        @Request() req: express.Request,
    ): Promise<{ pings: PingNotification[] }> {
        // @ts-ignore
        const userId = req.user.id;
        try {
            const pings = await this.pingService.getPingsForUser(userId);
            return { pings };
        } catch (err) {
            this.logger.error('Error fetching pings:', err);
            this.setStatus(500);
            const error = new Error(ErrorMessages.SYSTEM.INTERNAL_ERROR) as any;
            error.status = 500;
            throw error;
        }
    }

    // Delete a specific ping
    @Delete('{id}')
    @Response<ErrorResponse>('400', 'Bad Request', {
        error: ErrorMessages.PING.ID_REQUIRED,
    })
    public async deletePing(
        @Path() id: string,
        @Request() req: express.Request,
    ): Promise<{ success: boolean }> {
        // @ts-ignore
        const userId = req.user.id;

        if (!id) {
            this.setStatus(400);
            const error = new Error(ErrorMessages.PING.ID_REQUIRED) as any;
            error.status = 400;
            throw error;
        }

        try {
            const removed = await this.pingService.removePing(userId, id);
            return { success: removed };
        } catch (err) {
            this.logger.error('Error deleting ping:', err);
            this.setStatus(500);
            const error = new Error(ErrorMessages.SYSTEM.INTERNAL_ERROR) as any;
            error.status = 500;
            throw error;
        }
    }

    // Clear all pings for a specific channel
    @Delete('channel/{channelId}')
    @Response<ErrorResponse>('400', 'Bad Request', {
        error: ErrorMessages.PING.CHANNEL_ID_REQUIRED,
    })
    public async clearChannelPings(
        @Path() channelId: string,
        @Request() req: express.Request,
    ): Promise<{ success: boolean; clearedCount: number }> {
        // @ts-ignore
        const userId = req.user.id;

        if (!channelId) {
            this.setStatus(400);
            const error = new Error(
                ErrorMessages.PING.CHANNEL_ID_REQUIRED,
            ) as any;
            error.status = 400;
            throw error;
        }

        try {
            const clearedCount = await this.pingService.clearChannelPings(
                userId,
                channelId,
            );
            return { success: true, clearedCount };
        } catch (err) {
            this.logger.error('Error clearing channel pings:', err);
            this.setStatus(500);
            const error = new Error(ErrorMessages.SYSTEM.INTERNAL_ERROR) as any;
            error.status = 500;
            throw error;
        }
    }

    // Clear all pings for the current user
    @Delete()
    public async clearAllPings(
        @Request() req: express.Request,
    ): Promise<{ success: boolean }> {
        // @ts-ignore
        const userId = req.user.id;

        try {
            await this.pingService.clearAllPings(userId);
            return { success: true };
        } catch (err) {
            this.logger.error('Error clearing pings:', err);
            this.setStatus(500);
            const error = new Error(ErrorMessages.SYSTEM.INTERNAL_ERROR) as any;
            error.status = 500;
            throw error;
        }
    }
}
