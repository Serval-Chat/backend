/**
 * Integration Test Setup
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('ts-node/register');
require('tsconfig-paths/register'); // Register ts-node for importing TS files

// Set environment variables for testing
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.PORT = '0'; // Ephemeral port

let mongoServer;
let server;
let io;
let app;

/**
 * Global setup for integration tests
 */
async function setup() {
    // 1. Start MongoDB Memory Server
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    process.env.MONGO_URI = uri;

    // 2. Connect Mongoose
    await mongoose.connect(uri);

    // Ensure upload directories exist
    const fs = require('fs');
    const path = require('path');
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const bannersDir = path.join(uploadsDir, 'banners');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
    if (!fs.existsSync(path.join(uploadsDir, 'uploads'))) fs.mkdirSync(path.join(uploadsDir, 'uploads'));
    if (!fs.existsSync(bannersDir)) fs.mkdirSync(bannersDir);

    // 3. Import App and Routes
    require('reflect-metadata'); // Required for InversifyJS
    const { setupExpressApp } = require('../../src/server');
    const { NestFactory } = require('@nestjs/core');
    const { AppModule } = require('../../src/app.module');

    // Initialize Nest app
    const nextApp = await NestFactory.create(AppModule);
    const { ValidationPipe } = require('@nestjs/common');
    nextApp.useGlobalPipes(
        new ValidationPipe({
            transform: true,
            whitelist: true,
            forbidNonWhitelisted: true,
        }),
    );
    const expressApp = nextApp.getHttpAdapter().getInstance();

    // Apply Express setup (middleware, TSOA routes, manual routes)
    setupExpressApp(expressApp);

    await nextApp.init();

    app = expressApp;

    // 4. Create HTTP Server
    server = createServer(app);

    // 5. Initialize Socket.IO
    const { createSocketServer } = require('../../src/socket/init');
    const { container } = require('../../src/di/container');
    io = await createSocketServer(server, container);

    // 6. Start Server
    await new Promise((resolve) => {
        server.listen(0, () => {
            resolve();
        });
    });

    return { app, server, io, uri };
}

/**
 * Global teardown for integration tests
 */
async function teardown() {
    if (server) {
        await new Promise((resolve) => server.close(resolve));
    }

    if (io) {
        await io.close();
    }

    await mongoose.disconnect();

    if (mongoServer) {
        await mongoServer.stop();
    }
}

module.exports = {
    setup,
    teardown,
    getApp: () => app,
    getServer: () => server,
    getIo: () => io,
    getMongoUri: () => process.env.MONGO_URI
};
