process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.PORT = '0';
process.env.CHAT_PORT = '0';
process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.PROJ_LEVEL = 'development';
process.env.LOGS_PATH = './logs-test';
process.env.PUBLIC_FOLDER = './public';
process.env.HTTPS = 'off';
process.env.SERVER_URL = 'http://localhost';
process.env.MAX_MESSAGE_LENGTH = '10000';

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

let mongoServer: MongoMemoryReplSet | undefined;
let server: Server | undefined;
let io: { close: () => void | Promise<void> } | undefined;
let app: Express | undefined;
let nextApp: INestApplication | undefined;

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
        scan: async () => ['0', []],
        smembers: async () => [],
        hgetall: async () => ({}),
        hset: async () => 1,
        hdel: async () => 1,
        hlen: async () => 0,
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
    io = undefined;

    const srv = server;
    await new Promise<void>((resolve) => {
        srv.listen(0, () => resolve());
    });

    return { app: app as Express, server: server as Server, io, uri };
}

export async function teardown() {
    const wsServer = container.get<IWsServer>(TYPES.WsServer);
    await wsServer.shutdown();

    const redisService = container.get<IRedisService>(TYPES.RedisService);
    await redisService.quit();

    if (server !== undefined) {
        const srv = server;
        await new Promise(resolve => srv.close(resolve));
    }
    if (io !== undefined) await io.close();
    if (nextApp !== undefined) await nextApp.close();
    await mongoose.disconnect();
    if (mongoServer !== undefined) await mongoServer.stop();
}

export const getApp = () => app as Express;
export const getServer = () => server as Server;
export const getIo = () => io;
export const getMongoUri = () => process.env.MONGO_URI;
