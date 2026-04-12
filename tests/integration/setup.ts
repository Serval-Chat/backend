import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Express } from 'express';
import 'reflect-metadata';
import fs from 'fs';
import path from 'path';

import { container } from '../../src/di/container';
import { TYPES } from '../../src/di/types';
import { setupExpressApp } from '../../src/server';
import { AppModule } from '../../src/app.module';
import type { IWsServer } from '../../src/ws/interfaces/IWsServer';
import type { IRedisService } from '../../src/di/interfaces/IRedisService';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.PORT = '0';

let mongoServer: MongoMemoryReplSet;
let server: Server;
let io: { close: () => void | Promise<void> } | null;
let app: Express;
let nextApp: INestApplication;

export async function setup() {
    mongoServer = await MongoMemoryReplSet.create({
        replSet: {
            count: 1,
            storageEngine: 'wiredTiger',
        }
    });
    const uri = mongoServer.getUri();
    process.env.MONGO_URI = uri;

    await mongoose.connect(uri);

    const uploadsDir = path.join(process.cwd(), 'uploads');
    const bannersDir = path.join(uploadsDir, 'banners');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
    if (!fs.existsSync(path.join(uploadsDir, 'uploads'))) fs.mkdirSync(path.join(uploadsDir, 'uploads'));
    if (!fs.existsSync(bannersDir)) fs.mkdirSync(bannersDir);

    container.unbind(TYPES.RedisService);
    const mockRedisClient = {
        get: async () => null,
        set: async () => 'OK',
        setex: async () => 'OK',
        del: async () => 1,
        publish: async () => 0,
        subscribe: async () => 'OK',
        on: () => {},
        quit: async () => 'OK',
        status: 'ready',
        duplicate: function() { return this; },
        // presence-related methods
        scard: async () => 0,
        sadd: async () => 1,
        srem: async () => 1,
        expire: async () => 1,
        eval: async () => 0,
        multi: () => ({
            srem: () => ({ scard: () => ({ exec: async () => [[null, 0], [null, 0]] }) }),
            exec: async () => [[null, 0], [null, 0]],
        }),
    };
    container.bind(TYPES.RedisService).toConstantValue({
        getClient: () => mockRedisClient,
        getPublisher: () => mockRedisClient,
        getSubscriber: () => mockRedisClient,
        isHealthy: () => true,
        quit: async () => {}
    });

    nextApp = await NestFactory.create(AppModule, { logger: false });
    nextApp.useGlobalPipes(
        new ValidationPipe({
            transform: true,
            whitelist: true,
            forbidNonWhitelisted: true,
        }),
    );
    const expressApp = nextApp.getHttpAdapter().getInstance();

    setupExpressApp(expressApp);
    await nextApp.init();
    app = expressApp;

    server = createServer(app);
    const wsServer = container.get<IWsServer>(TYPES.WsServer);
    wsServer.initialize(server);
    io = null;

    await new Promise<void>((resolve) => {
        server.listen(0, () => resolve());
    });

    return { app, server, io, uri };
}

export async function teardown() {
    const wsServer = container.get<IWsServer>(TYPES.WsServer);
    if (wsServer) await wsServer.shutdown();

    const redisService = container.get<IRedisService>(TYPES.RedisService);
    if (redisService) await redisService.quit();

    if (server) await new Promise(resolve => server.close(resolve));
    if (io) await io.close();
    if (nextApp) await nextApp.close();
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
}

export const getApp = () => app;
export const getServer = () => server;
export const getIo = () => io;
export const getMongoUri = () => process.env.MONGO_URI;
