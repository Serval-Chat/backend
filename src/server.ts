import type { Application, Request, Response, NextFunction } from 'express';
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
import path from 'path';
import { RegisterRoutes } from '@/routes/tsoa/routes';
import swaggerUi from 'swagger-ui-express';
import { upload } from '@/config/multer';
import fs from 'fs';
import routes from '@/routes/index';

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
                            `'nonce-${(res as any).locals.cspNonce}'`,
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

    // TSOA Routes
    RegisterRoutes(app, { multer: upload });

    // Manual routes
    app.use('/', routes);

    // Swagger UI
    try {
        const swaggerDocument = JSON.parse(
            fs.readFileSync(
                path.join(process.cwd(), 'public', 'swagger.json'),
                'utf8',
            ),
        );
        app.use(
            '/docs',
            swaggerUi.serve,
            swaggerUi.setup(swaggerDocument, {
                swaggerOptions: {
                    supportedSubmitMethods: [],
                },
                customCss: `
                .swagger-ui .auth-wrapper { display: none !important; }
                .swagger-ui .try-out { display: none !important; }
            `,
            }),
        );
    } catch (err) {
        logger.error('Failed to load swagger.json:', err);
    }

    // DI Binding
    if (!container.isBound(TYPES.ExpressApp)) {
        container.bind<Application>(TYPES.ExpressApp).toConstantValue(app);
    }

    // Error handler
    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
        if (err.name === 'ValidateError') {
            logger.warn(
                `Validation error for ${req.method} ${req.url}:`,
                err.fields,
            );
            return res.status(400).json({
                error: 'Validation Failed',
                details: err.fields,
            });
        }

        logger.error('Unhandled error:', err);

        if (res.headersSent) {
            return next(err);
        }

        const status = err.status || 500;
        const message =
            PROJECT_LEVEL === 'production' && status >= 500
                ? 'Internal Server Error'
                : err.message || 'Internal Server Error';

        res.status(status).json({
            error: message,
            ...(PROJECT_LEVEL !== 'production' && { stack: err.stack }),
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
