import {
    Controller,
    Get,
    Headers,
    UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import { register } from '@/utils/metrics';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { METRICS_TOKEN } from '@/config/env';

@ApiTags('System')
@Controller('metrics')
export class MetricsController {
    @Get()
    @ApiOperation({ summary: 'Retrieve Prometheus metrics' })
    @ApiOkResponse({
        type: String,
        description: 'Prometheus metrics',
        content: { 'text/plain': {} },
    })
    public async getMetrics(
        @Headers('authorization') auth?: string,
    ): Promise<string> {
        const expectedAuth = `Bearer ${METRICS_TOKEN}`;
        const actualAuth = auth ?? '';

        const expectedBuffer = Buffer.from(expectedAuth);
        const actualBuffer = Buffer.from(actualAuth);

        const isMatch =
            expectedBuffer.length === actualBuffer.length &&
            crypto.timingSafeEqual(expectedBuffer, actualBuffer);

        if (METRICS_TOKEN === '' || !isMatch) {
            throw new UnauthorizedException('Invalid metrics token');
        }
        return await register.metrics();
    }
}
