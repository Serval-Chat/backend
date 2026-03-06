import { Controller, Get } from '@nestjs/common';
import { injectable } from 'inversify';
import { register } from '@/utils/metrics';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('System')
@injectable()
@Controller('metrics')
export class MetricsController {
    @Get()
    @ApiOperation({ summary: 'Retrieve Prometheus metrics' })
    @ApiResponse({
        status: 200,
        description: 'Prometheus metrics',
        content: { 'text/plain': {} },
    })
    public async getMetrics(): Promise<string> {
        return await register.metrics();
    }
}
