import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import { connectDB } from './src/config/db';

async function bootstrap() {
    await connectDB();
    const app = await NestFactory.create(AppModule, { logger: false });
    const config = new DocumentBuilder()
        .setTitle('Serchat API')
        .setDescription('The Serchat API description')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
    const document = SwaggerModule.createDocument(app, config);
    fs.writeFileSync(path.join(process.cwd(), 'openapi.yaml'), YAML.stringify(document));
    console.log('Done');
    process.exit(0);
}
bootstrap();
