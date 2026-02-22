import { Controller, Get, Headers, Inject } from '@nestjs/common';
import { injectable } from 'inversify';
import { TYPES } from '@/di/types';
import { register } from '@/utils/metrics';
import { ILogger } from '@/di/interfaces/ILogger';
import { ErrorMessages } from '@/constants/errorMessages';
import { ApiError } from '@/utils/ApiError';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { METRICS_TOKEN } from '@/config/env';

// Controller for exposing Prometheus metrics
@ApiTags('System')
@injectable()
@Controller('metrics')
export class MetricsController {
    constructor(
        @Inject(TYPES.Logger)
        private logger: ILogger,
    ) {}

    @Get()
    @ApiOperation({ summary: 'Retrieve Prometheus metrics' })
    @ApiHeader({
        name: 'Authorization',
        description: 'Bearer token for metrics access',
        required: true,
    })
    @ApiResponse({
        status: 200,
        description: 'Prometheus metrics',
        content: { 'text/plain': {} },
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({
        status: 500,
        description: 'Metrics security configuration missing',
    })
    public async getMetrics(
        @Headers('authorization') authorization?: string,
    ): Promise<string> {
        if (!METRICS_TOKEN) {
            throw new ApiError(
                500,
                ErrorMessages.SYSTEM.METRICS_SECURITY_NOT_CONFIGURED,
            );
        }

        if (!authorization || authorization !== `Bearer ${METRICS_TOKEN}`) {
            throw new ApiError(401, ErrorMessages.AUTH.UNAUTHORIZED);
        }

        return await register.metrics();
    }
}
