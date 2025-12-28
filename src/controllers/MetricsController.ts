import { Controller, Get, Route, Response, Tags, Header } from 'tsoa';
import { injectable, inject } from 'inversify';
import { TYPES } from '@/di/types';
import { register } from '@/utils/metrics';
import type { ILogger } from '@/di/interfaces/ILogger';
import { ErrorResponse } from '@/controllers/models/ErrorResponse';
import { ErrorMessages } from '@/constants/errorMessages';

/**
 * Controller for exposing Prometheus metrics.
 */
@injectable()
@Route('metrics')
@Tags('System')
export class MetricsController extends Controller {
    constructor(@inject(TYPES.Logger) private logger: ILogger) {
        super();
    }

    /**
     * Retrieves Prometheus metrics.
     */
    @Get()
    @Response<ErrorResponse>('401', 'Unauthorized', {
        error: ErrorMessages.AUTH.UNAUTHORIZED,
    })
    @Response<ErrorResponse>('500', 'Metrics security not configured', {
        error: ErrorMessages.SYSTEM.METRICS_SECURITY_NOT_CONFIGURED,
    })
    public async getMetrics(
        @Header('Authorization') authorization?: string,
    ): Promise<string> {
        const METRICS_TOKEN = process.env.METRICS_TOKEN;

        if (!METRICS_TOKEN) {
            this.setStatus(500);
            throw new Error(
                ErrorMessages.SYSTEM.METRICS_SECURITY_NOT_CONFIGURED,
            );
        }

        if (!authorization || authorization !== `Bearer ${METRICS_TOKEN}`) {
            this.setStatus(401);
            throw new Error(ErrorMessages.AUTH.UNAUTHORIZED);
        }

        this.setHeader('Content-Type', register.contentType);
        return await register.metrics();
    }
}
