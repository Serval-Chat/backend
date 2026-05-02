import { injectable, inject } from 'inversify';
import { Injectable, Inject } from '@nestjs/common';
import { IMetricsService } from '@/di/interfaces/IMetricsService';
import { TYPES } from '@/di/types';
import { ILogger } from '@/di/interfaces/ILogger';
import * as metrics from '@/utils/metrics';

@injectable()
@Injectable()
export class MetricsService implements IMetricsService {
    public constructor(
        @inject(TYPES.Logger)
        @Inject(TYPES.Logger)
        private logger: ILogger,
    ) {}

    public increment(metric: string, _labels?: Record<string, string>): void {
        try {
            switch (metric) {
                case 'password_reset.email.success':
                    metrics.passwordResetEmailCounter.inc({
                        status: 'success',
                    });
                    break;
                case 'password_reset.email.failure':
                    metrics.passwordResetEmailCounter.inc({
                        status: 'failure',
                    });
                    break;
                case 'password_reset.rate_limited':
                    metrics.passwordResetRateLimitedCounter.inc();
                    break;
                default:
                    this.logger.warn(
                        `Attempted to increment unknown metric: ${metric}`,
                    );
            }
        } catch (error) {
            this.logger.error(`Error incrementing metric ${metric}:`, error);
        }
    }
}
