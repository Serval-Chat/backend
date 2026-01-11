import type { WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';
import type { IWsUser } from '../types';
import type { AnyResponseWsEvent } from '../protocol/envelope';

export interface IWsServerMetrics {
    totalConnections: number;
    unauthenticatedConnections: number;
    authenticatedUsers: number;
    channelSubscriptions: number;
    serverSubscriptions: number;
}

export interface WsServerEvents {
    'user:authenticated': (user: IWsUser) => void;
    'user:online': (userId: string, username: string) => void;
    'user:offline': (userId: string, username: string) => void;
}

export interface IWsServer {
    authenticateConnection(ws: WebSocket, user: IWsUser): void;
    getAuthenticatedUser(ws: WebSocket): IWsUser | undefined;
    getUserSockets(userId: string): WebSocket[];
    isUserOnline(userId: string): boolean;
    getAllOnlineUsers(): string[];
    broadcastToUser(
        userId: string,
        event: AnyResponseWsEvent,
        replyTo?: string,
        excludeWs?: WebSocket,
    ): void;
    broadcastToAll(event: AnyResponseWsEvent): void;
    subscribeToChannel(ws: WebSocket, channelId: string): void;
    unsubscribeFromChannel(ws: WebSocket, channelId: string): void;
    broadcastToChannel(
        channelId: string,
        event: AnyResponseWsEvent,
        replyTo?: string,
        excludeWs?: WebSocket,
    ): void;
    subscribeToServer(ws: WebSocket, serverId: string): void;
    unsubscribeFromServer(ws: WebSocket, serverId: string): void;
    broadcastToServer(
        serverId: string,
        event: AnyResponseWsEvent,
        replyTo?: string,
        excludeWs?: WebSocket,
    ): void;
    broadcastToServerWithPermission(
        serverId: string,
        event: AnyResponseWsEvent,
        checkFn: (userId: string) => Promise<boolean> | boolean,
        replyTo?: string,
        excludeWs?: WebSocket,
    ): Promise<void>;
    sendToSocketById(
        socketId: string,
        event: AnyResponseWsEvent,
        replyTo?: string,
    ): void;
    sendToSocket(
        ws: WebSocket,
        event: AnyResponseWsEvent,
        replyTo?: string,
    ): void;
    closeConnection(ws: WebSocket, code: number, reason: string): void;
    broadcastToPresenceAudience(
        friendIds: string[],
        serverIds: string[],
        event: AnyResponseWsEvent,
        excludeWs?: WebSocket,
    ): void;

    getMetrics(): IWsServerMetrics;
    initialize(server: HttpServer): void;
    shutdown(): Promise<void>;

    // Event methods for decoupling
    on<K extends keyof WsServerEvents>(
        event: K,
        listener: WsServerEvents[K],
    ): this;
    on(event: string, listener: (...args: unknown[]) => void): this;

    off<K extends keyof WsServerEvents>(
        event: K,
        listener: WsServerEvents[K],
    ): this;
    off(event: string, listener: (...args: unknown[]) => void): this;

    emit<K extends keyof WsServerEvents>(
        event: K,
        ...args: Parameters<WsServerEvents[K]>
    ): boolean;
    emit(event: string, ...args: unknown[]): boolean;
}
