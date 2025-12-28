import { Server } from 'socket.io';

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
 * Set the Socket.IO server instance.
 * Internal use only by the socket initializer.
 */
export const setIO = (io: Server) => {
    ioInstance = io;
};
