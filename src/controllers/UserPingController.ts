import {
    Controller,
    Get,
    Delete,
    Param,
    Req,
    UseGuards,
    Inject,
} from '@nestjs/common';
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
import type { AuthenticatedRequest } from '@/middleware/auth';
import { ApiError } from '@/utils/ApiError';
import {
    GetPingsResponseDTO,
    DeletePingResponseDTO,
    ClearChannelPingsResponseDTO,
} from './dto/ping.response.dto';
import { NoBot } from '@/modules/auth/bot.decorator';

@ApiTags('Pings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@NoBot()
@Controller('api/v1/pings')
export class UserPingController {
    public constructor(
        @Inject(TYPES.PingService)
        private pingService: PingService,
        @Inject(TYPES.Logger)
        private logger: ILogger,
    ) {}

    @Get()
    @ApiOperation({ summary: 'Get all pings for the current user' })
    @ApiResponse({ status: 200, type: GetPingsResponseDTO })
    public async getPings(
        @Req() req: AuthenticatedRequest,
    ): Promise<GetPingsResponseDTO> {
        const userId = req.user.id;
        try {
            const pings = await this.pingService.getPingsForUser(userId);
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
        @Req() req: AuthenticatedRequest,
    ): Promise<DeletePingResponseDTO> {
        const userId = req.user.id;

        if (id === '') {
            throw new ApiError(400, 'Ping ID is required');
        }

        try {
            const removed = await this.pingService.removePing(userId, id);
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
        @Req() req: AuthenticatedRequest,
    ): Promise<ClearChannelPingsResponseDTO> {
        const userId = req.user.id;

        if (channelId === '') {
            throw new ApiError(400, 'Channel ID is required');
        }

        try {
            const clearedCount = await this.pingService.clearChannelPings(
                userId,
                channelId,
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
        @Req() req: AuthenticatedRequest,
    ): Promise<DeletePingResponseDTO> {
        const userId = req.user.id;

        try {
            await this.pingService.clearAllPings(userId);
            return { success: true };
        } catch (error) {
            this.logger.error('Failed to clear pings:', error);
            throw new ApiError(500, 'Internal server error');
        }
    }
}
