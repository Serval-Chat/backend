import {
    Controller,
    Get,
    Post,
    Param,
    Query,
    Req,
    UseGuards,
    Inject,
} from '@nestjs/common';
import { TYPES } from '@/di/types';
import {
    IWarningRepository,
    IWarning,
} from '@/di/interfaces/IWarningRepository';
import { ILogger } from '@/di/interfaces/ILogger';
import {
    ApiTags,
    ApiResponse,
    ApiBearerAuth,
    ApiOperation,
    ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import type { AuthenticatedRequest } from '@/middleware/auth';
import { ErrorMessages } from '@/constants/errorMessages';
import { ApiError } from '@/utils/ApiError';
import { UserWarningResponseDTO } from './dto/warning.response.dto';

@ApiTags('Warnings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/warnings')
export class UserWarningController {
    public constructor(
        @Inject(TYPES.WarningRepository)
        private warningRepo: IWarningRepository,
        @Inject(TYPES.Logger)
        private logger: ILogger,
    ) {}

    // Hides the specific issuer identity for privacy, labeling all warnings as issued by 'System'
    private sanitizeWarning(warning: IWarning): UserWarningResponseDTO {
        return {
            id: warning.snowflakeId,
            userId: warning.userId.toString(),
            message: warning.message,
            issuedBy: { username: 'System' },
            acknowledged: warning.acknowledged,
            acknowledgedAt: warning.acknowledgedAt,
            timestamp: warning.timestamp,
            expiryDurationMinutes: warning.expiryDurationMinutes,
            expiresAt: warning.expiresAt,
        };
    }

    @Get('me')
    @ApiOperation({ summary: "Get current user's warnings" })
    @ApiQuery({ name: 'acknowledged', required: false, type: Boolean })
    @ApiResponse({ status: 200, type: [UserWarningResponseDTO] })
    public async getMyWarnings(
        @Req() req: AuthenticatedRequest,
        @Query('acknowledged') acknowledged?: boolean,
    ): Promise<UserWarningResponseDTO[]> {
        const userId = req.user.id;
        try {
            const warnings = await this.warningRepo.findByUserId(
                userId,
                acknowledged,
            );
            return warnings.map((w) => this.sanitizeWarning(w));
        } catch (error) {
            this.logger.error('Failed to get warnings:', error);
            throw new ApiError(500, 'Internal server error');
        }
    }

    @Post(':id/acknowledge')
    @ApiOperation({ summary: 'Acknowledge a warning' })
    @ApiResponse({ status: 200, type: UserWarningResponseDTO })
    @ApiResponse({ status: 400, description: 'Warning ID is required' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Warning Not Found' })
    public async acknowledgeWarning(
        @Param('id') id: string,
        @Req() req: AuthenticatedRequest,
    ): Promise<UserWarningResponseDTO> {
        const userId = req.user.id;

        if (!id) {
            throw new ApiError(400, 'Warning ID is required');
        }

        const warning = await this.warningRepo.findById(id);
        if (warning === null) {
            throw new ApiError(404, ErrorMessages.SYSTEM.WARNING_NOT_FOUND);
        }

        if (warning.userId !== userId) {
            throw new ApiError(403, ErrorMessages.AUTH.FORBIDDEN);
        }

        if (warning.acknowledged === true) {
            return this.sanitizeWarning(warning);
        }

        const updatedWarning = await this.warningRepo.acknowledge(id);
        if (updatedWarning === null) {
            throw new ApiError(404, ErrorMessages.SYSTEM.WARNING_NOT_FOUND);
        }

        return this.sanitizeWarning(updatedWarning);
    }
}
