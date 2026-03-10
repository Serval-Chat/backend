import './tracing';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { PORT, USE_HTTPS, CERTS_PATH } from '@/config/env';
import * as fs from 'fs';
import * as path from 'path';
import type { HttpsOptions } from '@nestjs/common/interfaces/external/https-options.interface';
import { Logger, ValidationPipe } from '@nestjs/common';
import { setupExpressApp } from './server';
import { connectDB } from '@/config/db';
import { startMetricsUpdater } from '@/utils/metrics-updater';
import { initWebPush } from '@/services/pushService';
import { cleanupOrphanedPings, repairEveryoneRoles } from '@/utils/startup-tasks';
import { container } from '@/di/container';
import type { WsServer } from '@/ws/server';
import { TYPES } from '@/di/types';
import * as YAML from 'yaml';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
    const uploadDirs = [
        'uploads',
        'uploads/uploads',
        'uploads/servers',
        'uploads/webhooks',
        'uploads/emojis',
    ];
    for (const dir of uploadDirs) {
        const fullPath = path.join(process.cwd(), dir);
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
        }
    }

    try {
        await connectDB();
    } catch (err) {
        Logger.error('Database initialization failed', err, 'Bootstrap');
        process.exit(1);
    }

    await cleanupOrphanedPings();
    await repairEveryoneRoles();

    // Configure HTTPS if enabl
    let httpsOptions: HttpsOptions | undefined;
    if (USE_HTTPS === 'on') {
        const keyPath = path.join(CERTS_PATH, 'key.pem');
        const certPath = path.join(CERTS_PATH, 'cert.pem');

        if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
            httpsOptions = {
                key: fs.readFileSync(keyPath),
                cert: fs.readFileSync(certPath),
            };
        } else {
            Logger.error(
                'SSL certificate files not found in CERTS_PATH.',
                'Bootstrap',
            );
        }
    }

    // Create NestJS Application
    const app = await NestFactory.create(AppModule, {
        httpsOptions,
        bufferLogs: true,
    });
    app.useLogger(app.get(PinoLogger));

    const server = app.getHttpServer();
    server.keepAliveTimeout = 30000;
    server.headersTimeout = 31000;

    app.useGlobalPipes(
        new ValidationPipe({
            transform: true,
            whitelist: true,
            forbidNonWhitelisted: true,
        }),
    );

    const expressApp = app.getHttpAdapter().getInstance();
    setupExpressApp(expressApp);

    const httpServer = app.getHttpServer();

    const wsServer = container.get<WsServer>(TYPES.WsServer);
    wsServer.initialize(httpServer);

    // Initialize Swagger
    const config = new DocumentBuilder()
        .setTitle('Serchat API')
        .setDescription('The Serchat API description')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('/api/docs', app, document);

    // Generate openapi.yaml
    try {
        const yamlString = YAML.stringify(document);
        fs.writeFileSync(path.join(process.cwd(), 'openapi.yaml'), yamlString);
        Logger.log(
            'OpenAPI documentation generated to openapi.yaml',
            'Bootstrap',
        );
    } catch (err) {
        Logger.error('Failed to generate OpenAPI YAML', err, 'Bootstrap');
    }

    startMetricsUpdater(60000);
    initWebPush();

    // Start the application
    await app.listen(PORT, '0.0.0.0');
    Logger.log(`Application is running on: ${await app.getUrl()}`, 'Bootstrap');

    app.enableShutdownHooks();

    // Handle signals for WsServer shutdown
    let isShuttingDown = false;
    const cleanup = async (signal: string) => {
        if (isShuttingDown) {
            Logger.warn(`Shutdown already in progress, ignoring ${signal}`);
            return;
        }
        isShuttingDown = true;

        Logger.log(
            `Received ${signal}, shutting down gracefully...`,
            'Bootstrap',
        );

        const forceExitTimeout = setTimeout(() => {
            Logger.error('Forced exit after timeout', 'Bootstrap');
            process.exit(1);
        }, 30000); // 30 seconds

        try {
            await wsServer.shutdown();
            await app.close();
            clearTimeout(forceExitTimeout);
            Logger.log('Application shut down successfully', 'Bootstrap');
            process.exit(0);
        } catch (error) {
            clearTimeout(forceExitTimeout);
            Logger.error('Error during shutdown', error, 'Bootstrap');
            process.exit(1);
        }
    };

    process.on('SIGTERM', () => cleanup('SIGTERM'));
    process.on('SIGINT', () => cleanup('SIGINT'));
}

bootstrap();
