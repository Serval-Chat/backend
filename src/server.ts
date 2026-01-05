import type { Request, Response, NextFunction, Application } from 'express';
import express from 'express';
import { randomBytes } from 'crypto';
import { container } from '@/di/container';
import { TYPES } from '@/di/types';
import type { ILogger } from '@/di/interfaces/ILogger';
import { getMetricsMiddleware } from '@/middleware/metrics';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { PROJECT_LEVEL } from '@/config/env';
import routes from '@/routes/index';

interface ValidateError {
    name: 'ValidateError';
    fields: Record<string, unknown>;
}

interface ResponseWithLocals extends Response {
    locals: {
        cspNonce?: string;
        [key: string]: unknown;
    };
}

// Configures an existing Express application with standard middleware and routes
export function setupExpressApp(app: Application): Application {
    const logger = container.get<ILogger>(TYPES.Logger);

    app.set('trust proxy', true);
    app.disable('x-powered-by');

    // CSP nonce generation
    app.use((req: Request, res: Response, next: NextFunction) => {
        res.locals.cspNonce = randomBytes(16).toString('base64');
        next();
    });

    // Security headers
    app.use(
        helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: [
                        "'self'",
                        'https://cdn.jsdelivr.net',
                        'https://cdnjs.cloudflare.com',
                        'https://unpkg.com',
                        'https://ajax.googleapis.com',
                        'https://static.cloudflareinsights.com',
                        (_req, res) =>
                            `'nonce-${(res as ResponseWithLocals).locals.cspNonce}'`,
                        ...(PROJECT_LEVEL === 'development'
                            ? ["'unsafe-inline'"]
                            : []),
                    ],
                    styleSrc: [
                        "'self'",
                        "'unsafe-inline'",
                        'https://cdn.jsdelivr.net',
                        'https://cdnjs.cloudflare.com',
                        'https://unpkg.com',
                        'https://fonts.googleapis.com',
                    ],
                    imgSrc: [
                        "'self'",
                        'data:',
                        'blob:',
                        'https://*.tenor.com',
                        'https://*.googleapis.com',
                        'https://cdn.jsdelivr.net',
                        'https://cdnjs.cloudflare.com',
                        'https://unpkg.com',
                        'https://*.githubusercontent.com',
                        'https://www.gravatar.com',
                    ],
                    connectSrc: [
                        "'self'",
                        'wss:',
                        'https://tenor.googleapis.com',
                        'https://static.cloudflareinsights.com',
                        ...(PROJECT_LEVEL === 'development' ? ['ws:'] : []),
                    ],
                    fontSrc: [
                        "'self'",
                        'https://fonts.gstatic.com',
                        'https://cdn.jsdelivr.net',
                        'https://cdnjs.cloudflare.com',
                        'https://unpkg.com',
                        'data:',
                    ],
                    objectSrc: ["'none'"],
                    mediaSrc: [
                        "'self'",
                        'https://*.tenor.com',
                        'https://*.googleapis.com',
                    ],
                    frameSrc: ["'none'"],
                },
            },
            crossOriginEmbedderPolicy: false,
            crossOriginResourcePolicy: { policy: 'cross-origin' },
        }),
    );

    // CORS
    app.use(
        cors({
            origin: '*',
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization'],
            credentials: true,
        }),
    );

    // Gzip
    app.use(compression());

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Metrics
    app.use(getMetricsMiddleware());

    // Manual routes
    app.use('/', routes);

    // DI Binding
    if (!container.isBound(TYPES.ExpressApp)) {
        container.bind<Application>(TYPES.ExpressApp).toConstantValue(app);
    }

    // Error handler
    app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
        if (
            typeof err === 'object' &&
            err !== null &&
            'name' in err &&
            err.name === 'ValidateError'
        ) {
            logger.warn(
                `Validation error for ${req.method} ${req.url}:`,
                (err as ValidateError).fields,
            );
            return res.status(400).json({
                error: 'Validation Failed',
                details: (err as ValidateError).fields,
            });
        }

        logger.error('Unhandled error:', err);

        if (res.headersSent) {
            return next(err);
        }

        const error = err as {
            status?: number;
            message?: string;
            stack?: string;
        };
        const status = error.status || 500;
        const message =
            PROJECT_LEVEL === 'production' && status >= 500
                ? 'Internal Server Error'
                : error.message || 'Internal Server Error';

        res.status(status).json({
            error: message,
            ...(PROJECT_LEVEL !== 'production' && { stack: error.stack }),
        });
    });

    return app;
}

/**
 * Creates and configures the Express application.
 */
export function createApp(): Application {
    const app: Application = express();
    return setupExpressApp(app);
}

const app = createApp();
export default app;
