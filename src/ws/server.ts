import type { Server as HttpServer } from 'http';
import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import logger from '@/utils/logger';
import { WS_AUTH_TIMEOUT } from '@/config/env';
import type { IWsUser } from './types';
import { inject, injectable } from 'inversify';
import { TYPES } from '@/di/types';
import type { WsDispatcher } from './dispatcher';
import { websocketConnectionsGauge } from '@/utils/metrics';
import type { IWsEnvelope, AnyResponseWsEvent } from './protocol/envelope';
import { send, sendToMany } from './utils/broadcast';
import { EventEmitter } from 'node:events';

import type { IWsServer } from './interfaces/IWsServer';

/**
 * Server for WS :O
 */
@injectable()
export class WsServer extends EventEmitter implements IWsServer {
    private wss!: WebSocketServer;
    private unauthenticatedConnections = new Set<WebSocket>();

    // Track authenticated connections
    private socketToUser = new WeakMap<WebSocket, IWsUser>();
    private connectionsByUserId = new Map<string, Set<WebSocket>>();
    private socketsById = new Map<string, WebSocket>();

    // Track channel and server subscriptions
    private channelSubscriptions = new Map<string, Set<WebSocket>>();
    private serverSubscriptions = new Map<string, Set<WebSocket>>();
    private socketSubscriptions = new WeakMap<
        WebSocket,
        { channels: Set<string>; servers: Set<string> }
    >();
    private socketRateLimitKeys = new WeakMap<WebSocket, Set<string>>();

    private authTimeouts = new WeakMap<WebSocket, NodeJS.Timeout>();
    private readonly AUTH_TIMEOUT_MS = WS_AUTH_TIMEOUT;

    constructor(@inject(TYPES.WsDispatcher) private dispatcher: WsDispatcher) {
        super();
    }

    private getSocketId(ws: WebSocket): string | undefined {
        return (ws as WebSocket & { id?: string }).id;
    }

    public initialize(server: HttpServer) {
        this.dispatcher.registerControllers();
        this.wss = new WebSocketServer({
            noServer: true,
            path: '/ws',
            maxPayload: 1024 * 1024, // 1MB limit
        });

        server.on('upgrade', (request, socket, head) => {
            const pathname = new URL(
                request.url || '',
                `http://${request.headers.host}`,
            ).pathname;

            if (pathname === '/ws') {
                this.wss.handleUpgrade(request, socket, head, (ws) => {
                    this.wss.emit('connection', ws, request);
                });
            }
        });

        this.wss.on('connection', (ws: WebSocket) => {
            logger.info('[WsServer] New connection established');
            this.unauthenticatedConnections.add(ws);
            websocketConnectionsGauge.inc();

            // Register connection with dispatcher for unique ID assignment
            this.dispatcher.registerConnection(ws);
            const socketId = this.getSocketId(ws);
            if (socketId) {
                this.socketsById.set(socketId, ws);
            }

            // Set authentication timeout
            const timeout = setTimeout(() => {
                if (!this.socketToUser.has(ws)) {
                    logger.warn('[WsServer] Connection authentication timeout');
                    ws.close(4001, 'Authentication timeout');
                }
            }, this.AUTH_TIMEOUT_MS);
            this.authTimeouts.set(ws, timeout);

            ws.on('message', async (data) => {
                try {
                    const message: IWsEnvelope = JSON.parse(data.toString());
                    const authUser = this.getAuthenticatedUser(ws);
                    await this.dispatcher.dispatch(ws, message, authUser);
                } catch (error) {
                    logger.error('[WsServer] Failed to handle message:', error);
                }
            });

            ws.on('close', () => {
                logger.info('[WsServer] Connection closed');
                this.removeConnection(ws);
                websocketConnectionsGauge.dec();
            });

            ws.on('error', (error) => {
                logger.error('[WsServer] WebSocket error:', error);
                this.removeConnection(ws);
            });
        });

        logger.info('[WsServer] WebSocket server initialized on /ws');
    }

    /**
     * Authenticates a WebSocket connection.
     * Moves connection from unauthenticated to authenticated tracking.
     */
    public authenticateConnection(ws: WebSocket, user: IWsUser): void {
        // Clear authentication timeout
        const timeout = this.authTimeouts.get(ws);
        if (timeout) {
            clearTimeout(timeout);
            this.authTimeouts.delete(ws);
        }

        this.unauthenticatedConnections.delete(ws);
        this.socketToUser.set(ws, user);

        let userSockets = this.connectionsByUserId.get(user.userId);
        if (!userSockets) {
            userSockets = new Set();
            this.connectionsByUserId.set(user.userId, userSockets);
        }
        userSockets.add(ws);

        logger.info(
            `[WsServer] User ${user.username} authenticated (total sessions: ${userSockets.size})`,
        );

        this.emit('user:authenticated', user);

        if (userSockets.size === 1) {
            this.emit('user:online', user.userId, user.username);
        }
    }

    /**
     * Gets the authenticated user for a WebSocket connection.
     */
    public getAuthenticatedUser(ws: WebSocket): IWsUser | undefined {
        return this.socketToUser.get(ws);
    }

    /**
     * Gets all WebSocket connections for a user.
     */
    public getUserSockets(userId: string): WebSocket[] {
        const sockets = this.connectionsByUserId.get(userId);
        return sockets ? Array.from(sockets) : [];
    }

    /**
     * Checks if a user has any active connections.
     */
    public isUserOnline(userId: string): boolean {
        const sockets = this.connectionsByUserId.get(userId);
        return sockets !== undefined && sockets.size > 0;
    }

    /**
     * Gets IDs of all online users.
     */
    public getAllOnlineUsers(): string[] {
        return Array.from(this.connectionsByUserId.keys());
    }

    /**
     * Broadcasts an event to all sessions of a specific user.
     */
    public broadcastToUser(
        userId: string,
        event: AnyResponseWsEvent,
        replyTo?: string,
        excludeWs?: WebSocket,
    ): void {
        let sockets = this.getUserSockets(userId);
        if (excludeWs) {
            sockets = sockets.filter((s) => s !== excludeWs);
        }
        if (sockets.length > 0) {
            sendToMany(sockets, event, replyTo);
            logger.debug(
                `[WsServer] Broadcast to user ${userId} (${sockets.length} sessions)`,
            );
        }
    }

    /**
     * Broadcasts an event to all authenticated users.
     */
    public broadcastToAll(event: AnyResponseWsEvent): void {
        const recipients: WebSocket[] = [];
        this.wss.clients.forEach((client) => {
            if (client.readyState === 1 && this.socketToUser.has(client)) {
                recipients.push(client);
            }
        });

        if (recipients.length > 0) {
            sendToMany(recipients, event);
            logger.debug(
                `[WsServer] Global broadcast to ${recipients.length} authenticated users`,
            );
        }
    }

    /**
     * Subscribes a socket to a channel.
     */
    public subscribeToChannel(ws: WebSocket, channelId: string): void {
        let subscribers = this.channelSubscriptions.get(channelId);
        if (!subscribers) {
            subscribers = new Set();
            this.channelSubscriptions.set(channelId, subscribers);
        }
        subscribers.add(ws);

        let subs = this.socketSubscriptions.get(ws);
        if (!subs) {
            subs = { channels: new Set(), servers: new Set() };
            this.socketSubscriptions.set(ws, subs);
        }
        subs.channels.add(channelId);

        logger.debug(`[WsServer] Socket subscribed to channel ${channelId}`);
    }

    /**
     * Unsubscribes a socket from a channel.
     */
    public unsubscribeFromChannel(ws: WebSocket, channelId: string): void {
        const subscribers = this.channelSubscriptions.get(channelId);
        if (subscribers) {
            subscribers.delete(ws);
            if (subscribers.size === 0) {
                this.channelSubscriptions.delete(channelId);
            }

            const subs = this.socketSubscriptions.get(ws);
            if (subs) {
                subs.channels.delete(channelId);
            }
        }
    }

    /**
     * Broadcasts an event to all subscribers of a channel.
     */
    public broadcastToChannel(
        channelId: string,
        event: AnyResponseWsEvent,
        replyTo?: string,
        excludeWs?: WebSocket,
    ): void {
        const subscribers = this.channelSubscriptions.get(channelId);
        if (subscribers && subscribers.size > 0) {
            let recipients = Array.from(subscribers);
            if (excludeWs) {
                recipients = recipients.filter((r) => r !== excludeWs);
            }
            if (recipients.length > 0) {
                sendToMany(recipients, event, replyTo);
                logger.debug(
                    `[WsServer] Broadcast to channel ${channelId} (${recipients.length} subscribers)`,
                );
            }
        }
    }

    /**
     * Subscribes a socket to a server.
     */
    public subscribeToServer(ws: WebSocket, serverId: string): void {
        let subscribers = this.serverSubscriptions.get(serverId);
        if (!subscribers) {
            subscribers = new Set();
            this.serverSubscriptions.set(serverId, subscribers);
        }
        subscribers.add(ws);

        let subs = this.socketSubscriptions.get(ws);
        if (!subs) {
            subs = { channels: new Set(), servers: new Set() };
            this.socketSubscriptions.set(ws, subs);
        }
        subs.servers.add(serverId);

        logger.debug(`[WsServer] Socket subscribed to server ${serverId}`);
    }

    /**
     * Unsubscribes a socket from a server.
     */
    public unsubscribeFromServer(ws: WebSocket, serverId: string): void {
        const subscribers = this.serverSubscriptions.get(serverId);
        if (subscribers) {
            subscribers.delete(ws);
            if (subscribers.size === 0) {
                this.serverSubscriptions.delete(serverId);
            }

            const subs = this.socketSubscriptions.get(ws);
            if (subs) {
                subs.servers.delete(serverId);
            }
        }
    }

    /**
     * Broadcasts an event to all subscribers of a server.
     */
    public broadcastToServer(
        serverId: string,
        event: AnyResponseWsEvent,
        replyTo?: string,
        excludeWs?: WebSocket,
    ): void {
        const subscribers = this.serverSubscriptions.get(serverId);
        if (subscribers && subscribers.size > 0) {
            let recipients = Array.from(subscribers);
            if (excludeWs) {
                recipients = recipients.filter((r) => r !== excludeWs);
            }
            if (recipients.length > 0) {
                sendToMany(recipients, event, replyTo);
                logger.debug(
                    `[WsServer] Broadcast to server ${serverId} (${recipients.length} subscribers)`,
                );
            }
        }
    }

    /**
     * Broadcasts an event to subscribers of a server who satisfy a permission check.
     */
    public async broadcastToServerWithPermission(
        serverId: string,
        event: AnyResponseWsEvent,
        checkFn: (userId: string) => Promise<boolean> | boolean,
        replyTo?: string,
        excludeWs?: WebSocket,
    ): Promise<void> {
        const subscribers = this.serverSubscriptions.get(serverId);
        if (subscribers && subscribers.size > 0) {
            const recipients: WebSocket[] = [];

            const permissionCache = new Map<string, boolean>();

            for (const ws of subscribers) {
                if (ws === excludeWs || ws.readyState !== 1) continue;

                const user = this.getAuthenticatedUser(ws);
                if (!user) continue;

                let hasPermission = permissionCache.get(user.userId);
                if (hasPermission === undefined) {
                    try {
                        hasPermission = await checkFn(user.userId);
                    } catch (err) {
                        logger.error(
                            `[WsServer] Permission check failed for user ${user.userId}`,
                            err,
                        );
                        hasPermission = false;
                    }
                    permissionCache.set(user.userId, hasPermission);
                }

                if (hasPermission) {
                    recipients.push(ws);
                }
            }

            if (recipients.length > 0) {
                sendToMany(recipients, event, replyTo);
                logger.debug(
                    `[WsServer] Broadcast to server ${serverId} (${recipients.length} authorized subscribers)`,
                );
            }
        }
    }

    /**
     * Sends an event to a specific WebSocket by its ID.
     */
    public sendToSocketById(
        socketId: string,
        event: AnyResponseWsEvent,
        replyTo?: string,
    ): void {
        const ws = this.socketsById.get(socketId);
        if (ws && ws.readyState === 1) {
            send(ws, event, replyTo);
        }
    }

    /**
     * Sends an event to a specific WebSocket.
     */
    public sendToSocket(
        ws: WebSocket,
        event: AnyResponseWsEvent,
        replyTo?: string,
    ): void {
        send(ws, event, replyTo);
    }

    /**
     * Gracefully closes a connection with a code and reason.
     */
    public closeConnection(ws: WebSocket, code: number, reason: string): void {
        ws.close(code, reason);
        this.removeConnection(ws);
    }

    /**
     * Removes a connection from all internal tracking structures.
     */
    private removeConnection(ws: WebSocket) {
        // Clear auth timeout if exists
        const timeout = this.authTimeouts.get(ws);
        if (timeout) {
            clearTimeout(timeout);
            this.authTimeouts.delete(ws);
        }

        const socketId = this.getSocketId(ws);
        if (socketId) {
            this.socketsById.delete(socketId);
        }

        this.dispatcher.cleanup(ws);

        if (this.unauthenticatedConnections.has(ws)) {
            this.unauthenticatedConnections.delete(ws);
            return;
        }

        // Get user before we lose the reference
        const user = this.socketToUser.get(ws);

        if (user) {
            // Remove from user's socket set
            const userSockets = this.connectionsByUserId.get(user.userId);
            if (userSockets) {
                userSockets.delete(ws);
                if (userSockets.size === 0) {
                    this.connectionsByUserId.delete(user.userId);
                    logger.info(
                        `[WsServer] User ${user.username} went offline (all sessions disconnected)`,
                    );

                    // Notify presence
                    this.emit('user:offline', user.userId, user.username);
                } else {
                    logger.debug(
                        `[WsServer] User ${user.username} session disconnected (${userSockets.size} remaining)`,
                    );
                }
            }

            const subs = this.socketSubscriptions.get(ws);
            if (subs) {
                for (const channelId of subs.channels) {
                    const subscribers =
                        this.channelSubscriptions.get(channelId);
                    if (subscribers) {
                        subscribers.delete(ws);
                        if (subscribers.size === 0) {
                            this.channelSubscriptions.delete(channelId);
                        }
                    }
                }

                for (const serverId of subs.servers) {
                    const subscribers = this.serverSubscriptions.get(serverId);
                    if (subscribers) {
                        subscribers.delete(ws);
                        if (subscribers.size === 0) {
                            this.serverSubscriptions.delete(serverId);
                        }
                    }
                }
            }
        }
    }

    /**
     * Gets metrics about current connections.
     */
    public getMetrics() {
        return {
            totalConnections:
                this.unauthenticatedConnections.size +
                this.connectionsByUserId.size,
            unauthenticatedConnections: this.unauthenticatedConnections.size,
            authenticatedUsers: this.connectionsByUserId.size,
            channelSubscriptions: this.channelSubscriptions.size,
            serverSubscriptions: this.serverSubscriptions.size,
        };
    }

    /**
     * Broadcasts a presence event to the relevant audience (friends + mutual server subscribers).
     * Deduplicates sockets to prevent double-sending.
     */
    public broadcastToPresenceAudience(
        friendIds: string[],
        serverIds: string[],
        event: AnyResponseWsEvent,
        excludeWs?: WebSocket,
    ): void {
        const recipients = new Set<WebSocket>();

        // 1. Add friends' sockets
        for (const friendId of friendIds) {
            const sockets = this.connectionsByUserId.get(friendId);
            if (sockets) {
                sockets.forEach((socket) => recipients.add(socket));
            }
        }

        // 2. Add server subscribers (people viewing the servers the user is in)
        for (const serverId of serverIds) {
            const subscribers = this.serverSubscriptions.get(serverId);
            if (subscribers) {
                subscribers.forEach((socket) => recipients.add(socket));
            }
        }

        // 3. Exclude specific socket
        if (excludeWs) {
            recipients.delete(excludeWs);
        }

        if (recipients.size > 0) {
            sendToMany(Array.from(recipients), event);
            logger.debug(
                `[WsServer] Broadcast presence to ${recipients.size} unique sockets (${friendIds.length} friends, ${serverIds.length} servers)`,
            );
        }
    }

    /**
     * Gracefully shuts down the WebSocket server.
     */
    public async shutdown(): Promise<void> {
        logger.info('[WsServer] Shutting down WebSocket server...');

        const closePromise = new Promise<void>((resolve) => {
            this.wss.close(() => {
                logger.info('[WsServer] WebSocket server closed');
                resolve();
            });
        });

        // Close all active connections
        for (const ws of this.unauthenticatedConnections) {
            ws.terminate();
        }
        for (const sockets of this.connectionsByUserId.values()) {
            for (const ws of sockets) {
                ws.terminate();
            }
        }

        await closePromise;
        this.dispatcher.destroy();
        this.removeAllListeners();
    }
}
