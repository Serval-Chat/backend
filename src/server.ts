import type { Request, Response, NextFunction, Application } from 'express';
import express from 'express';
import { randomBytes } from 'crypto';
import { container } from '@/di/container';
import { TYPES } from '@/di/types';
import type { ILogger } from '@/di/interfaces/ILogger';
import { getMetricsMiddleware } from '@/middleware/metrics';
import { register } from '@/utils/metrics';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { PROJECT_LEVEL, FRONTEND_URL } from '@/config/env';
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
            noSniff: true, // prevents MIME type sniffing
            strictTransportSecurity:
                PROJECT_LEVEL === 'production'
                    ? {
                        maxAge: 31536000, // 1 year
                        includeSubDomains: true,
                        preload: true,
                    }
                    : false,
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
                        'https://catfla.re/',
                        'https://rolling.catfla.re/',
                        ...(PROJECT_LEVEL === 'development'
                            ? [
                                'http://localhost:8000',
                                'http://localhost:8001',
                                'http://127.0.0.1:8000',
                                'http://127.0.0.1:8001',
                            ]
                            : []),
                    ],
                    connectSrc: [
                        "'self'",
                        'https://catfla.re',
                        'https://rolling.catfla.re',
                        'wss://catfla.re',
                        'wss://rolling.catfla.re',
                        'https://tenor.googleapis.com',
                        'https://static.cloudflareinsights.com',
                        'https://cloudflareinsights.com',
                        ...(PROJECT_LEVEL === 'development'
                            ? [
                                'http://localhost:8000',
                                'http://localhost:8001',
                                'http://127.0.0.1:8000',
                                'http://127.0.0.1:8001',
                                'ws://localhost:8000',
                                'ws://localhost:8001',
                                'ws://127.0.0.1:8000',
                                'ws://127.0.0.1:8001',
                            ]
                            : []),
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
                    ...(PROJECT_LEVEL === 'production'
                        ? { upgradeInsecureRequests: [] }
                        : {}),
                },
            },
            crossOriginOpenerPolicy: { policy: 'same-origin' },
            crossOriginEmbedderPolicy: { policy: 'credentialless' },
            crossOriginResourcePolicy: { policy: 'cross-origin' },
        }),
    );

    app.use((_req: Request, res: Response, next: NextFunction) => {
        res.setHeader(
            'Permissions-Policy',
            'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
        );

        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Keep-Alive', 'timeout=30, max=1000');

        next();
    });

    // Cache control for static assets
    app.use('/uploads', (req: Request, res: Response, next: NextFunction) => {
        // 1 year cache for images/avatars/banners (immutable)
        if (req.url.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i)) {
            res.setHeader(
                'Cache-Control',
                'public, max-age=31536000, immutable',
            );
            res.setHeader('X-Content-Type-Options', 'nosniff');
        }
        // 1 day cache for other files
        else {
            res.setHeader('Cache-Control', 'public, max-age=86400');
        }
        next();
    });

    // CORS
    app.use(
        cors({
            origin: (origin, callback) => {
                const allowedOrigins = [
                    'https://catfla.re',
                    'https://rolling.catfla.re',
                    'http://localhost:5173',
                    'http://localhost:8001',
                    FRONTEND_URL,
                ];

                if (!origin || allowedOrigins.includes(origin)) {
                    callback(null, true);
                } else {
                    callback(new Error('Not allowed by CORS'));
                }
            },
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization'],
            credentials: true,
            maxAge: 86400,
        }),
    );

    // Gzip
    app.use(compression());

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Metrics
    app.use(getMetricsMiddleware());

    // is loopback?
    const METRICS_ALLOWED_RE =
        /^(127\.|::1$|::ffff:127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/;

    app.get('/metrics', async (req: Request, res: Response) => {
        const ip = req.ip ?? '';
        if (!METRICS_ALLOWED_RE.test(ip)) {
            res.status(403).end('Forbidden');
            return;
        }
        try {
            res.set('Content-Type', register.contentType);
            res.end(await register.metrics());
        } catch (err) {
            res.status(500).end(String(err));
        }
    });

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
