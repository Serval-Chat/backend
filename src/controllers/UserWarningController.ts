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
import { Request } from 'express';
import { ErrorMessages } from '@/constants/errorMessages';
import { ApiError } from '@/utils/ApiError';
import { UserWarningResponseDTO } from './dto/warning.response.dto';
import { JWTPayload } from '@/utils/jwt';
import { injectable, inject } from 'inversify';

interface RequestWithUser extends Request {
    user: JWTPayload;
}

// Controller for managing user warnings
@ApiTags('Warnings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@injectable()
@Controller('api/v1/warnings')
export class UserWarningController {
    constructor(
        @inject(TYPES.WarningRepository)
        @Inject(TYPES.WarningRepository)
        private warningRepo: IWarningRepository,
        @inject(TYPES.Logger)
        @Inject(TYPES.Logger)
        private logger: ILogger,
    ) { }

    // Sanitizes warning data for the current user
    // Hides the specific issuer identity for privacy, labeling all warnings as issued by 'System'
    private sanitizeWarning(warning: IWarning): UserWarningResponseDTO {
        return {
            _id: warning._id.toString(),
            userId: warning.userId.toString(),
            message: warning.message,
            issuedBy: { username: 'System' },
            acknowledged: warning.acknowledged,
            acknowledgedAt: warning.acknowledgedAt,
            timestamp: warning.timestamp,
        };
    }

    @Get('me')
    @ApiOperation({ summary: "Get current user's warnings" })
    @ApiQuery({ name: 'acknowledged', required: false, type: Boolean })
    @ApiResponse({ status: 200, type: [UserWarningResponseDTO] })
    public async getMyWarnings(
        @Req() req: Request,
        @Query('acknowledged') acknowledged?: boolean,
    ): Promise<UserWarningResponseDTO[]> {
        const userId = (req as unknown as RequestWithUser).user.id;
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
        @Req() req: Request,
    ): Promise<UserWarningResponseDTO> {
        const userId = (req as unknown as RequestWithUser).user.id;

        if (!id) {
            throw new ApiError(400, 'Warning ID is required');
        }

        const warning = await this.warningRepo.findById(id);
        if (!warning) {
            throw new ApiError(404, ErrorMessages.SYSTEM.WARNING_NOT_FOUND);
        }

        if (warning.userId.toString() !== userId) {
            throw new ApiError(403, ErrorMessages.AUTH.FORBIDDEN);
        }

        if (warning.acknowledged) {
            return this.sanitizeWarning(warning);
        }

        const updatedWarning = await this.warningRepo.acknowledge(id);
        if (!updatedWarning) {
            throw new ApiError(404, ErrorMessages.SYSTEM.WARNING_NOT_FOUND);
        }

        return this.sanitizeWarning(updatedWarning);
    }
}
