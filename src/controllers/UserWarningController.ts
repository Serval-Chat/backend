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
    private sanitizeWarning(warning: IWarning): any {
        if (!warning) return warning;
        const sanitized = { ...warning };
        sanitized.issuedBy = { username: 'System' };
        return sanitized;
    }

    // Get current user's warnings
    @Get('me')
    public async getMyWarnings(
        @Request() req: express.Request,
        @Query() acknowledged?: boolean,
    ): Promise<any[]> {
        // @ts-ignore
        const userId = req.user.id;
        try {
            const warnings = await this.warningRepo.findByUserId(
                userId,
                acknowledged,
            );
            return warnings.map((w) => this.sanitizeWarning(w));
        } catch (error) {
            this.logger.error('[WARNINGS] Failed to load warnings:', error);
            this.setStatus(500);
            const err = new Error(
                ErrorMessages.SYSTEM.FAILED_LOAD_WARNINGS,
            ) as any;
            err.status = 500;
            throw err;
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
    ): Promise<any> {
        // @ts-ignore
        const userId = req.user.id;

        if (!id) {
            this.setStatus(400);
            const error = new Error(
                ErrorMessages.SYSTEM.WARNING_ID_REQUIRED,
            ) as any;
            error.status = 400;
            throw error;
        }

        const warning = await this.warningRepo.findById(id);
        if (!warning) {
            this.setStatus(404);
            const error = new Error(
                ErrorMessages.SYSTEM.WARNING_NOT_FOUND,
            ) as any;
            error.status = 404;
            throw error;
        }

        if (warning.userId.toString() !== userId) {
            this.setStatus(403);
            const error = new Error(ErrorMessages.AUTH.FORBIDDEN) as any;
            error.status = 403;
            throw error;
        }

        if (warning.acknowledged) {
            return this.sanitizeWarning(warning);
        }

        const updatedWarning = await this.warningRepo.acknowledge(id);
        if (!updatedWarning) {
            this.setStatus(404);
            const error = new Error(
                ErrorMessages.SYSTEM.WARNING_NOT_FOUND,
            ) as any;
            error.status = 404;
            throw error;
        }

        return this.sanitizeWarning(updatedWarning);
    }
}
