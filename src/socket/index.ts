import { Server } from 'socket.io';
import type http from 'http';
import { ioConfig } from '../config/io';
import { container } from '../di/container';
import { RealTimeServer } from '../realtime/index';
import { createAuthMiddleware } from '../realtime/middleware/AuthMiddleware';

let ioInstance: Server | null = null;

/**
 * Get the Socket.IO server instance.
 * @throws {Error} If Socket.IO has not been initialized.
 */
export const getIO = (): Server => {
    if (!ioInstance) {
        throw new Error('Socket.IO not initialized');
    }
    return ioInstance;
};

/**
 * Initialize Socket.IO server and attach to HTTP server.
 *
 * Flow:
 * 1. Creates Socket.IO instance with configured options
 * 2. Applies authentication middleware
 * 3. Initializes RealTimeServer (decorator-based gateway system)
 *
 * @returns Configured Socket.IO server instance
 */
export const createSocketServer = (httpServer: http.Server) => {
    const io = new Server(httpServer, ioConfig);
    ioInstance = io;

    // Apply Auth Middleware
    io.use(createAuthMiddleware(container));

    // Initialize RealTime Server
    const realTimeServer = new RealTimeServer(container);
    realTimeServer.initialize(io);

    return io;
};
