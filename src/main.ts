import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PORT, USE_HTTPS, CERTS_PATH } from '@/config/env';
import * as fs from 'fs';
import * as path from 'path';
import type { HttpsOptions } from '@nestjs/common/interfaces/external/https-options.interface';
import { Logger, ValidationPipe } from '@nestjs/common';
import { setupExpressApp } from './server';
import { connectDB } from '@/config/db';
import { startMetricsUpdater } from '@/utils/metrics-updater';
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
    });

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
    SwaggerModule.setup('docs', app, document);

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

    // Start the application
    await app.listen(PORT);
    Logger.log(`Application is running on: ${await app.getUrl()}`, 'Bootstrap');

    // Enable graceful shutdown
    app.enableShutdownHooks();

    // Handle signals for WsServer shutdown
    const cleanup = () => {
        Logger.log('Shutting down WebSocket server...', 'Bootstrap');
        wsServer.shutdown();
    };

    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
}

bootstrap();
