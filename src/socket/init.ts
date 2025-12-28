import { Server } from 'socket.io';
import type http from 'http';
import { ioConfig } from '@/config/io';
import { createAuthMiddleware } from '@/realtime/middleware/AuthMiddleware';
import type { Container } from 'inversify';

import { setIO } from './index';
import { RealTimeServer } from '@/realtime/index';

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
export const createSocketServer = async (
    httpServer: http.Server,
    container: Container,
) => {
    const io = new Server(httpServer, ioConfig);
    setIO(io);

    // Apply Auth Middleware
    io.use(createAuthMiddleware(container));

    // Initialize RealTime Server
    const realTimeServer = new RealTimeServer(container);
    realTimeServer.initialize(io);

    return io;
};
