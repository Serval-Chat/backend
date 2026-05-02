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
import { Types } from 'mongoose';
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
import { injectable } from 'inversify';

interface RequestWithUser extends Request {
    user: JWTPayload;
}

@ApiTags('Warnings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@injectable()
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
        const userOid = new Types.ObjectId(userId);
        try {
            const warnings = await this.warningRepo.findByUserId(
                userOid,
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
        const userOid = new Types.ObjectId(userId);

        if (!id) {
            throw new ApiError(400, 'Warning ID is required');
        }

        const warningOid = new Types.ObjectId(id);
        const warning = await this.warningRepo.findById(warningOid);
        if (warning === null) {
            throw new ApiError(404, ErrorMessages.SYSTEM.WARNING_NOT_FOUND);
        }

        if (!warning.userId.equals(userOid)) {
            throw new ApiError(403, ErrorMessages.AUTH.FORBIDDEN);
        }

        if (warning.acknowledged === true) {
            return this.sanitizeWarning(warning);
        }

        const updatedWarning = await this.warningRepo.acknowledge(warningOid);
        if (updatedWarning === null) {
            throw new ApiError(404, ErrorMessages.SYSTEM.WARNING_NOT_FOUND);
        }

        return this.sanitizeWarning(updatedWarning);
    }
}
