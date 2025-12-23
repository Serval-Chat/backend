import type { Application, Request, Response, NextFunction } from 'express';
import express from 'express';
import { randomBytes } from 'crypto';
import { container } from './di/container';
import { TYPES } from './di/types';
import type { ILogger } from './di/interfaces/ILogger';
import type { IUserRepository } from './di/interfaces/IUserRepository';
import type { PresenceService } from './realtime/services/PresenceService';
import { getMetricsMiddleware } from './middleware/metrics';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { PROJECT_LEVEL } from './config/env';
import path from 'path';
import { connectDB } from './config/db';
import { PORT, USE_HTTPS, CERTS_PATH } from './config/env';
import routes from './routes/index';
import { RegisterRoutes } from './routes/tsoa/routes';
import swaggerUi from 'swagger-ui-express';
import { createSocketServer } from './socket';
import { User } from './models/User';
import { startMetricsUpdater } from './utils/metrics-updater';
import { upload } from './config/multer';
import fs from 'fs';
import http from 'http';
import https from 'https';

/**
 * Creates and configures the Express application with dependency injection
 * @returns Configured Express application instance
 */
export function createApp(): Application {
    // Get logger from DI container
    const logger = container.get<ILogger>(TYPES.Logger);

    const app: Application = express();

    // Trust proxy (required for Cloudflare/Reverse Proxies)
    app.set('trust proxy', true);

    // Disable X-Powered-By header (security: prevent framework disclosure)
    app.disable('x-powered-by');

    // CSP nonce generation middleware
    app.use((req: Request, res: Response, next: NextFunction) => {
        res.locals.cspNonce = randomBytes(16).toString('base64');
        next();
    });

    // Security headers with Helmet
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
                        'https://static.cloudflareinsights.com', // Cloudflare beacon
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
                        'https://static.cloudflareinsights.com', // Cloudflare beacon
                        ...(PROJECT_LEVEL === 'development' ? ['ws:'] : []),
                    ],
                    fontSrc: [
                        "'self'",
                        'https://fonts.gstatic.com',
                        'https://cdn.jsdelivr.net',
                        'https://cdnjs.cloudflare.com',
                        'data:', // allow inline fonts like base64 woff2
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
            crossOriginEmbedderPolicy: false, // Allow embedding for uploads
            crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow cross-origin resource sharing
        }),
    );

    // CORS configuration
    app.use(
        cors({
            origin: '*',
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization'],
            credentials: true,
        }),
    );

    // Gzip compression
    app.use(compression());

    // Basic middlewarez
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Metrics middleware
    app.use(getMetricsMiddleware());

    // TSOA Routes
    RegisterRoutes(app, { multer: upload });

    // Manual Routes
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

    // Bind the app instance to the DI container for other services to use
    container.bind<Application>(TYPES.ExpressApp).toConstantValue(app);

    // Global error handler
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

const app = createApp();

export default app;

async function addUsernameToExistingUsers() {
    const users = await User.find({
        $or: [
            { username: { $exists: false } },
            { username: null },
            { username: '' },
        ],
    });

    for (const user of users) {
        user.username = user.login;
        await user.save();
    }

    const logger = container.get<ILogger>(TYPES.Logger);
    logger.info(`Updated ${users.length} users with a username.`);
}

/**
 * Start the Express
 */
export async function startServer() {
    const logger = container.get<ILogger>(TYPES.Logger);

    try {
        await connectDB();
        await addUsernameToExistingUsers();

        if (!fs.existsSync(path.join(__dirname, '..', 'uploads'))) {
            fs.mkdirSync(path.join(__dirname, '..', 'uploads'));
            fs.mkdirSync(path.join(__dirname, '..', 'uploads', 'uploads'));
            fs.mkdirSync(path.join(__dirname, '..', 'uploads', 'servers'));
            fs.mkdirSync(path.join(__dirname, '..', 'uploads', 'webhooks'));
            fs.mkdirSync(path.join(__dirname, '..', 'uploads', 'emojis'));
        } else {
            if (
                !fs.existsSync(path.join(__dirname, '..', 'uploads', 'uploads'))
            ) {
                fs.mkdirSync(path.join(__dirname, '..', 'uploads', 'uploads'));
            }
            if (
                !fs.existsSync(path.join(__dirname, '..', 'uploads', 'servers'))
            ) {
                fs.mkdirSync(path.join(__dirname, '..', 'uploads', 'servers'));
            }
            if (
                !fs.existsSync(
                    path.join(__dirname, '..', 'uploads', 'webhooks'),
                )
            ) {
                fs.mkdirSync(path.join(__dirname, '..', 'uploads', 'webhooks'));
            }
            if (
                !fs.existsSync(path.join(__dirname, '..', 'uploads', 'emojis'))
            ) {
                fs.mkdirSync(path.join(__dirname, '..', 'uploads', 'emojis'));
            }
        }

        // Create Express app with DI support
        const expressApp = createApp();
        expressApp.use('/', routes);

        let httpServer: http.Server | https.Server;

        if (USE_HTTPS === 'on') {
            const keyPath = `${CERTS_PATH}/key.pem`;
            const certPath = `${CERTS_PATH}/cert.pem`;

            if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
                throw new Error(
                    'SSL certificate files not found in CERTS_PATH.',
                );
            }

            const options = {
                key: fs.readFileSync(keyPath),
                cert: fs.readFileSync(certPath),
            };

            httpServer = https.createServer(options, expressApp);
            logger.info('Starting server with HTTPS...');
        } else {
            httpServer = http.createServer(expressApp);
            logger.info('Starting server with HTTP...');
        }

        createSocketServer(httpServer);

        // Start metrics updater and update every 60 seconds
        startMetricsUpdater(60000);

        await new Promise<void>((resolve, reject) => {
            httpServer.listen(PORT, (err?: any) => {
                if (err) {
                    logger.error(
                        "Couldn't start the server. Error message: %s",
                        err.message,
                    );
                    reject(err);
                    return;
                }
                logger.info(`HTTP server is listening on port: ${PORT}`);
                resolve();
            });
        });
    } catch (err: any) {
        logger.error('Failed to start:', err.message || err);
        logger.error('Full error:', err);
        if (err.stack) {
            logger.error('Stack trace:', err.stack);
        }
        process.exit(1);
    }
}
