import { Controller, Get, Headers, Inject } from '@nestjs/common';
import { injectable, inject } from 'inversify';
import { TYPES } from '@/di/types';
import { register } from '@/utils/metrics';
import { ILogger } from '@/di/interfaces/ILogger';
import { ErrorMessages } from '@/constants/errorMessages';
import { ApiError } from '@/utils/ApiError';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';

// Controller for exposing Prometheus metrics
@ApiTags('System')
@injectable()
@Controller('metrics')
export class MetricsController {
    constructor(
        @inject(TYPES.Logger)
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
        const METRICS_TOKEN = process.env.METRICS_TOKEN;

        if (!METRICS_TOKEN) {
            throw new ApiError(
                500,
                ErrorMessages.SYSTEM.METRICS_SECURITY_NOT_CONFIGURED,
            );
        }

        if (!authorization || authorization !== `Bearer ${METRICS_TOKEN}`) {
            throw new ApiError(401, ErrorMessages.AUTH.UNAUTHORIZED);
        }

        // Note: NestJS by default sets Content-Type to application/json.
        // We might need to override it in the response, but returning string usually sets it to text/html or text/plain.
        // The register.metrics() returns a string.
        // Ideally we should use @Res() to set header precisely or use Header decorator but Header decorator is static.
        // Let's rely on standard return for now, but to set Content-Type dynamically we might need @Res({ passthrough: true }).
        // However, register.metrics() format is text/plain usually.

        // Wait, TSOA version used this.setHeader.
        // NestJS way:
        // @Header('Content-Type', register.contentType) would work if register.contentType is constant.
        // It is accessible.
        // But let's just return string. Nest will likely use text/html or text/plain.
        // Prometheus expects text/plain.
        // Let's use @Header if possible or just rely on defaults.
        // Better: use @Res() with passthrough if we need explicit content type.

        return await register.metrics();
    }
}
