import {
    Controller,
    Get,
    Delete,
    Param,
    Req,
    UseGuards,
    Inject,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { TYPES } from '@/di/types';
import { PingService } from '@/services/PingService';
import { ILogger } from '@/di/interfaces/ILogger';
import {
    ApiTags,
    ApiResponse,
    ApiBearerAuth,
    ApiOperation,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { Request } from 'express';
import { JWTPayload } from '@/utils/jwt';
import { ApiError } from '@/utils/ApiError';
import {
    GetPingsResponseDTO,
    DeletePingResponseDTO,
    ClearChannelPingsResponseDTO,
} from './dto/ping.response.dto';
import { injectable } from 'inversify';

interface RequestWithUser extends Request {
    user: JWTPayload;
}

// Controller for managing user pings (mentions and notifications)
@ApiTags('Pings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@injectable()
@Controller('api/v1/pings')
export class UserPingController {
    constructor(
        @Inject(TYPES.PingService)
        private pingService: PingService,
        @Inject(TYPES.Logger)
        private logger: ILogger,
    ) {}

    @Get()
    @ApiOperation({ summary: 'Get all pings for the current user' })
    @ApiResponse({ status: 200, type: GetPingsResponseDTO })
    public async getPings(@Req() req: Request): Promise<GetPingsResponseDTO> {
        const userId = (req as unknown as RequestWithUser).user.id;
        const userOid = new Types.ObjectId(userId);
        try {
            const pings = await this.pingService.getPingsForUser(userOid);
            return { pings };
        } catch (error) {
            this.logger.error('Failed to get pings:', error);
            throw new ApiError(500, 'Internal server error');
        }
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a specific ping' })
    @ApiResponse({ status: 200, type: DeletePingResponseDTO })
    @ApiResponse({ status: 400, description: 'Ping ID is required' })
    public async deletePing(
        @Param('id') id: string,
        @Req() req: Request,
    ): Promise<DeletePingResponseDTO> {
        const userId = (req as unknown as RequestWithUser).user.id;
        const userOid = new Types.ObjectId(userId);

        if (!id) {
            throw new ApiError(400, 'Ping ID is required');
        }

        const pingOid = new Types.ObjectId(id);
        try {
            const removed = await this.pingService.removePing(userOid, pingOid);
            return { success: removed };
        } catch (error) {
            this.logger.error('Error deleting ping:', error);
            throw new ApiError(500, 'Internal server error');
        }
    }

    @Delete('channel/:channelId')
    @ApiOperation({ summary: 'Clear all pings for a specific channel' })
    @ApiResponse({ status: 200, type: ClearChannelPingsResponseDTO })
    @ApiResponse({ status: 400, description: 'Channel ID is required' })
    public async clearChannelPings(
        @Param('channelId') channelId: string,
        @Req() req: Request,
    ): Promise<ClearChannelPingsResponseDTO> {
        const userId = (req as unknown as RequestWithUser).user.id;
        const userOid = new Types.ObjectId(userId);

        if (!channelId) {
            throw new ApiError(400, 'Channel ID is required');
        }

        const channelOid = new Types.ObjectId(channelId);
        try {
            const clearedCount = await this.pingService.clearChannelPings(
                userOid,
                channelOid,
            );
            return { success: true, clearedCount };
        } catch (error) {
            this.logger.error('Error clearing channel pings:', error);
            throw new ApiError(500, 'Internal server error');
        }
    }

    @Delete()
    @ApiOperation({ summary: 'Clear all pings for the current user' })
    @ApiResponse({ status: 200, type: DeletePingResponseDTO })
    public async clearAllPings(
        @Req() req: Request,
    ): Promise<DeletePingResponseDTO> {
        const userId = (req as unknown as RequestWithUser).user.id;
        const userOid = new Types.ObjectId(userId);

        try {
            await this.pingService.clearAllPings(userOid);
            return { success: true };
        } catch (error) {
            this.logger.error('Failed to clear pings:', error);
            throw new ApiError(500, 'Internal server error');
        }
    }
}
