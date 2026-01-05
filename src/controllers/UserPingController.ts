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
import { ErrorResponse } from '@/controllers/models/ErrorResponse';
import { ErrorMessages } from '@/constants/errorMessages';
import type { Request as ExpressRequest } from 'express';
import { JWTPayload } from '@/utils/jwt';

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
        @Request() req: ExpressRequest,
    ): Promise<{ pings: PingNotification[] }> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        try {
            const pings = await this.pingService.getPingsForUser(userId);
            return { pings };
        } catch (err) {
            this.logger.error('Error fetching pings:', err);
            this.setStatus(500);
            throw new Error(ErrorMessages.SYSTEM.INTERNAL_ERROR);
        }
    }

    // Delete a specific ping
    @Delete('{id}')
    @Response<ErrorResponse>('400', 'Bad Request', {
        error: ErrorMessages.PING.ID_REQUIRED,
    })
    public async deletePing(
        @Path() id: string,
        @Request() req: ExpressRequest,
    ): Promise<{ success: boolean }> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;

        if (!id) {
            this.setStatus(400);
            throw new Error(ErrorMessages.PING.ID_REQUIRED);
        }

        try {
            const removed = await this.pingService.removePing(userId, id);
            return { success: removed };
        } catch (err) {
            this.logger.error('Error deleting ping:', err);
            this.setStatus(500);
            throw new Error(ErrorMessages.SYSTEM.INTERNAL_ERROR);
        }
    }

    // Clear all pings for a specific channel
    @Delete('channel/{channelId}')
    @Response<ErrorResponse>('400', 'Bad Request', {
        error: ErrorMessages.PING.CHANNEL_ID_REQUIRED,
    })
    public async clearChannelPings(
        @Path() channelId: string,
        @Request() req: ExpressRequest,
    ): Promise<{ success: boolean; clearedCount: number }> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;

        if (!channelId) {
            this.setStatus(400);
            throw new Error(ErrorMessages.PING.CHANNEL_ID_REQUIRED);
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
            throw new Error(ErrorMessages.SYSTEM.INTERNAL_ERROR);
        }
    }

    // Clear all pings for the current user
    @Delete()
    public async clearAllPings(
        @Request() req: ExpressRequest,
    ): Promise<{ success: boolean }> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;

        try {
            await this.pingService.clearAllPings(userId);
            return { success: true };
        } catch (err) {
            this.logger.error('Error clearing pings:', err);
            this.setStatus(500);
            throw new Error(ErrorMessages.SYSTEM.INTERNAL_ERROR);
        }
    }
}
