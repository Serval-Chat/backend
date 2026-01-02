import type { Socket } from 'socket.io';
import type { ZodSchema } from 'zod';

// User Payload interface
//
// Represents the authenticated user attached to a socket
export interface UserPayload {
    id: string;
    username: string;
    tokenVersion?: number;
}

// Socket Context interface
//
// Passed to every event handler, containing the socket and user info
export interface SocketContext {
    socket: Socket;
    user: UserPayload;
}

// Gateway Metadata interface
//
// Configuration stored by the @Gateway decorator
export interface GatewayMetadata {
    namespace?: string;
}

export interface EventHandlerMetadata {
    event: string;
    schema?: ZodSchema;
    method: string;
}

export interface MiddlewareMetadata {
    middleware: Function;
    method: string;
}

export interface RealTimeModule {
    gateways: Function[];
    onInit?: (io: any) => void;
}

// Gateway Connection Hook interface
//
// Gateways can implement this to handle new connections
export interface OnGatewayConnection {
    handleConnection(ctx: SocketContext): void | Promise<void>;
}
