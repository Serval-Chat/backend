import type { Request, Response, NextFunction } from 'express';
import { httpRequestDuration, httpRequestsTotal } from '@/utils/metrics';
import type { ILogger } from '@/di/interfaces/ILogger';
import { container } from '@/di/container';
import { TYPES } from '@/di/types';

/**
 * Creates a metrics middleware with dependency injection support.
 *
 * Captures request duration and total request count, labeled by method,
 * route, and status code.
 *
 * @param logger - Optional logger instance for recording metric collection errors.
 * @returns Express middleware function for metrics collection.
 */
export const createMetricsMiddleware = (logger?: ILogger) => {
    // Use injected logger or fallback to console
    const metricsLogger = logger || {
        error: (message: string, ...args: any[]) =>
            console.error(`[METRICS] ${message}`, ...args),
        warn: (message: string, ...args: any[]) =>
            console.warn(`[METRICS] ${message}`, ...args),
    };

    return (req: Request, res: Response, next: NextFunction) => {
        const start = Date.now();

        // Store original end function
        const originalEnd = res.end;

        // Override end function to capture metrics
        res.end = function (this: Response, ...args: any[]): Response {
            try {
                const duration = (Date.now() - start) / 1000; // Convert to seconds
                const route = (req as any).route?.path || req.path || 'unknown';
                const method = req.method;
                const statusCode = res.statusCode.toString();

                // Record metrics
                httpRequestDuration
                    .labels(method, route, statusCode)
                    .observe(duration);
                httpRequestsTotal.labels(method, route, statusCode).inc();
            } catch (error) {
                metricsLogger.error('Failed to record metrics', {
                    error:
                        error instanceof Error ? error.message : String(error),
                });
            }

            // Call original end function
            return originalEnd.apply(this, args as any) as Response;
        } as any;

        next();
    };
};

// Legacy middleware for backward compatibility
export const metricsMiddleware = createMetricsMiddleware();

// DI-aware middleware factory
export const getMetricsMiddleware = () => {
    const logger = container.get<ILogger>(TYPES.Logger);
    return createMetricsMiddleware(logger);
};
