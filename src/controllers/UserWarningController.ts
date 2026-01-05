import {
    Controller,
    Get,
    Post,
    Route,
    Path,
    Query,
    Security,
    Response,
    Tags,
    Request,
} from 'tsoa';
import { injectable, inject } from 'inversify';
import { TYPES } from '@/di/types';
import type {
    IWarningRepository,
    IWarning,
} from '@/di/interfaces/IWarningRepository';
import type { ILogger } from '@/di/interfaces/ILogger';
import express from 'express';
import { ErrorResponse } from '@/controllers/models/ErrorResponse';
import { ErrorMessages } from '@/constants/errorMessages';
import { ApiError } from '@/utils/ApiError';

// Controller for managing user warnings
@injectable()
@Route('api/v1/warnings')
@Tags('Warnings')
@Security('jwt')
export class UserWarningController extends Controller {
    constructor(
        @inject(TYPES.WarningRepository)
        private warningRepo: IWarningRepository,
        @inject(TYPES.Logger) private logger: ILogger,
    ) {
        super();
    }

    // Sanitizes warning data for the current user
    //
    // Hides the specific issuer identity for privacy, labeling all warnings as issued by 'System'
    private sanitizeWarning(warning: IWarning): Record<string, unknown> {
        if (!warning) return warning as unknown as Record<string, unknown>;
        const sanitized = { ...warning } as Record<string, unknown>;
        sanitized.issuedBy = { username: 'System' };
        return sanitized;
    }

    // Get current user's warnings
    @Get('me')
    public async getMyWarnings(
        @Request() req: express.Request,
        @Query() acknowledged?: boolean,
    ): Promise<Record<string, unknown>[]> {
        // @ts-ignore
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

    // Acknowledge a warning
    @Post('{id}/acknowledge')
    @Response<ErrorResponse>('400', 'Bad Request', {
        error: ErrorMessages.SYSTEM.WARNING_ID_REQUIRED,
    })
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.AUTH.FORBIDDEN,
    })
    @Response<ErrorResponse>('404', 'Warning Not Found', {
        error: ErrorMessages.SYSTEM.WARNING_NOT_FOUND,
    })
    public async acknowledgeWarning(
        @Path() id: string,
        @Request() req: express.Request,
    ): Promise<Record<string, unknown>> {
        // @ts-ignore
        const userId = req.user.id;

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
