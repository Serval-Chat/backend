import type { Server as HttpServer } from 'http';
import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import logger from '@/utils/logger';
import { WS_AUTH_TIMEOUT, INSTANCE_NAME } from '@/config/env';
import type { IWsUser } from './types';
import { inject, injectable } from 'inversify';
import { TYPES } from '@/di/types';
import type { WsDispatcher } from './dispatcher';
import {
    websocketConnectionsGauge,
    wsMsgTotalCounter,
    wsMsgSizeBytesHistogram,
    wsErrorsTotalCounter,
    chatRoomsActiveGauge,
} from '@/utils/metrics';
import type { IWsEnvelope, AnyResponseWsEvent } from './protocol/envelope';
import { send, sendToMany } from './utils/broadcast';
import { EventEmitter } from 'node:events';
import { trace, SpanStatusCode, context } from '@opentelemetry/api';
import type { IRedisService } from '@/di/interfaces/IRedisService';
import type { PermissionService } from '@/permissions/PermissionService';
import mongoose from 'mongoose';

import type { IWsServer } from './interfaces/IWsServer';

const wsTracer = trace.getTracer('serval-ws-gateway');

/**
 * Server for WS :O
 */
type RedisBroadcastMessage =
    | {
          action: 'broadcastToUser';
          payload: {
              userId: string;
              event: AnyResponseWsEvent;
              replyTo?: string;
          };
      }
    | { action: 'broadcastToAll'; payload: { event: AnyResponseWsEvent } }
    | {
          action: 'broadcastToChannel';
          payload: {
              channelId: string;
              event: AnyResponseWsEvent;
              replyTo?: string;
          };
      }
    | {
          action: 'broadcastToServer';
          payload: {
              serverId: string;
              event: AnyResponseWsEvent;
              replyTo?: string;
          };
      }
    | {
          action: 'broadcastToServerWithPermission';
          payload: {
              serverId: string;
              event: AnyResponseWsEvent;
              permissionCheck: {
                  type: 'server' | 'channel';
                  targetId?: string;
                  permission: string;
              };
              replyTo?: string;
          };
      }
    | {
          action: 'sendToSocketById';
          payload: {
              socketId: string;
              event: AnyResponseWsEvent;
              replyTo?: string;
          };
      }
    | {
          action: 'broadcastToPresenceAudience';
          payload: {
              friendIds: string[];
              serverIds: string[];
              event: AnyResponseWsEvent;
          };
      };

type IRedisEnvelope = { instanceId: string } & RedisBroadcastMessage;

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
    public readonly instanceId = INSTANCE_NAME;

    /**
     * Per-socket UUID map. We maintain this ourselves rather than casting ws.id
     * because the `ws` library does not set an `id` property on its WebSocket objects.
     */
    private socketIds = new WeakMap<WebSocket, string>();

    /**
     * Lua script for atomic presence first-join detection.
     *
     * KEYS[1] = presence key   ARGV[1] = member   ARGV[2] = TTL (seconds)
     * Returns the SCARD *before* the SADD so the caller can detect the first join.
     * Because this runs inside a Lua script, it is atomic across all Redis clients.
     */
    private static readonly PRESENCE_FIRST_JOIN_SCRIPT = `
        local before = redis.call('SCARD', KEYS[1])
        redis.call('SADD', KEYS[1], ARGV[1])
        redis.call('EXPIRE', KEYS[1], ARGV[2])
        return before
    `;

    /** Presence TTL in seconds. Must be comfortably longer than the client ping interval. */
    private static readonly PRESENCE_TTL_S = 90;

    constructor(
        @inject(TYPES.WsDispatcher) private dispatcher: WsDispatcher,
        @inject(TYPES.RedisService) private redisService: IRedisService,
        @inject(TYPES.PermissionService)
        private permissionService: PermissionService,
    ) {
        super();
    }

    private getSocketId(ws: WebSocket): string | undefined {
        return this.socketIds.get(ws);
    }

    private assignSocketId(ws: WebSocket): string {
        const id = crypto.randomUUID();
        this.socketIds.set(ws, id);
        return id;
    }

    private publishToRedis<T extends RedisBroadcastMessage>(
        action: T['action'],
        payload: T['payload'],
    ) {
        const publisher = this.redisService.getPublisher();
        publisher
            .publish(
                'SERCHAT_WS_BROADCAST',
                JSON.stringify({
                    instanceId: this.instanceId,
                    action,
                    payload,
                }),
            )
            .catch((err) =>
                logger.error('[WsServer] Redis publish error:', err),
            );
    }

    /**
     * Handles messages received from Redis Pub/Sub.
     *
     * NOTE: messages originating from THIS instance are filtered out before this
     * method is called (see the subscriber 'message' handler in `initialize`).
     * This method only runs for messages published by OTHER instances.
     */
    private async handleRedisMessage(data: IRedisEnvelope) {
        try {
            switch (data.action) {
                case 'broadcastToUser':
                    this._localBroadcastToUser(
                        data.payload.userId,
                        data.payload.event,
                        data.payload.replyTo,
                    );
                    break;
                case 'broadcastToAll':
                    this._localBroadcastToAll(data.payload.event);
                    break;
                case 'broadcastToChannel':
                    this._localBroadcastToChannel(
                        data.payload.channelId,
                        data.payload.event,
                        data.payload.replyTo,
                    );
                    break;
                case 'broadcastToServer':
                    this._localBroadcastToServer(
                        data.payload.serverId,
                        data.payload.event,
                        data.payload.replyTo,
                    );
                    break;
                case 'broadcastToServerWithPermission':
                    await this._localBroadcastToServerWithPermission(
                        data.payload.serverId,
                        data.payload.event,
                        data.payload.permissionCheck,
                        data.payload.replyTo,
                    );
                    break;
                case 'sendToSocketById':
                    this._localSendToSocketById(
                        data.payload.socketId,
                        data.payload.event,
                        data.payload.replyTo,
                    );
                    break;
                case 'broadcastToPresenceAudience':
                    this._localBroadcastToPresenceAudience(
                        data.payload.friendIds,
                        data.payload.serverIds,
                        data.payload.event,
                    );
                    break;
            }
        } catch (err) {
            logger.error('[WsServer] Redis message handle error', err);
        }
    }

    public initialize(server: HttpServer) {
        this.dispatcher.registerControllers();

        const subscriber = this.redisService.getSubscriber();
        subscriber.subscribe('SERCHAT_WS_BROADCAST', (err, count) => {
            if (err) {
                logger.error(
                    '[WsServer] Failed to subscribe to Redis channel',
                    err,
                );
            } else {
                logger.info(
                    `[WsServer] Subscribed to Redis channel SERCHAT_WS_BROADCAST (${count})`,
                );
            }
        });

        subscriber.on('message', async (channel, message) => {
            if (channel === 'SERCHAT_WS_BROADCAST') {
                try {
                    const data = JSON.parse(message);
                    if (data.instanceId === this.instanceId) return; // Ignore our own messages
                    await this.handleRedisMessage(data);
                } catch (err) {
                    logger.error(
                        '[WsServer] Failed to process Redis broadcast',
                        err,
                    );
                }
            }
        });

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
            const socketId = this.assignSocketId(ws);
            this.socketsById.set(socketId, ws);

            // Set authentication timeout
            const timeout = setTimeout(() => {
                if (!this.socketToUser.has(ws)) {
                    logger.warn('[WsServer] Connection authentication timeout');
                    ws.close(4001, 'Authentication timeout');
                }
            }, this.AUTH_TIMEOUT_MS);
            this.authTimeouts.set(ws, timeout);

            ws.on('message', async (data) => {
                const span = wsTracer.startSpan('ws.message.handle', {
                    attributes: {
                        'messaging.system': 'websocket',
                        'messaging.destination': 'chat',
                        'message.size_bytes':
                            data instanceof Buffer
                                ? data.byteLength
                                : Buffer.byteLength(data.toString()),
                    },
                });
                await context.with(
                    trace.setSpan(context.active(), span),
                    async () => {
                        try {
                            const raw =
                                data instanceof Buffer
                                    ? data
                                    : Buffer.from(data.toString());
                            const sizeBytes = raw.byteLength;
                            const message: IWsEnvelope = JSON.parse(
                                raw.toString(),
                            );
                            const msgType =
                                (message.event as { type?: string })?.type ??
                                'unknown';

                            wsMsgTotalCounter.inc({ type: msgType });
                            wsMsgSizeBytesHistogram.observe(
                                { type: msgType },
                                sizeBytes,
                            );

                            const authUser = this.getAuthenticatedUser(ws);
                            await this.dispatcher.dispatch(
                                ws,
                                message,
                                authUser,
                            );
                            span.setStatus({ code: SpanStatusCode.OK });
                        } catch (error) {
                            span.recordException(error as Error);
                            span.setStatus({ code: SpanStatusCode.ERROR });
                            wsErrorsTotalCounter.inc({
                                reason: 'handler_exception',
                            });
                            logger.error(
                                '[WsServer] Failed to handle message:',
                                error,
                            );
                        } finally {
                            span.end();
                        }
                    },
                );
            });

            ws.on('close', () => {
                logger.info('[WsServer] Connection closed');
                this.removeConnection(ws);
                websocketConnectionsGauge.dec();
            });

            ws.on('error', (error) => {
                logger.error('[WsServer] WebSocket error:', error);
                wsErrorsTotalCounter.inc({ reason: 'ws_error_event' });
                this.removeConnection(ws);
            });
        });

        logger.info('[WsServer] WebSocket server initialized on /ws');
    }

    /**
     * Authenticates a WebSocket connection.
     * Moves connection from unauthenticated to authenticated tracking.
     */
    public async authenticateConnection(
        ws: WebSocket,
        user: IWsUser,
    ): Promise<void> {
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

        const presenceKey = `presence:user:${user.userId}`;
        const socketId = this.getSocketId(ws);
        if (!socketId) {
            logger.error(
                `[WsServer] authenticateConnection: socket has no ID for user ${user.userId}`,
            );
            return;
        }
        const presenceMember = `${this.instanceId}:${socketId}`;
        const redis = this.redisService.getClient();

        const countBefore = (await redis.eval(
            WsServer.PRESENCE_FIRST_JOIN_SCRIPT,
            1,
            presenceKey,
            presenceMember,
            String(WsServer.PRESENCE_TTL_S),
        )) as number;

        if (countBefore === 0) {
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
     * Checks if a user has any active connections globally.
     *
     * NOTE: The local `connectionsByUserId` fast-path can transiently return `true`
     * for a user whose last socket just closed but whose cleanup hasn't completed yet
     * (the 'close' event is async). This window is very short in practice.
     */
    public async isUserOnline(userId: string): Promise<boolean> {
        if (this.connectionsByUserId.has(userId)) return true;

        try {
            const count = await this.redisService
                .getClient()
                .scard(`presence:user:${userId}`);
            return count > 0;
        } catch (err) {
            logger.error(
                `[WsServer] Failed to check global presence for ${userId}:`,
                err,
            );
            return false;
        }
    }

    /**
     * Gets IDs of all online users.
     */
    public getAllOnlineUsers(): string[] {
        return Array.from(this.connectionsByUserId.keys());
    }

    /**
     * Broadcasts an event to all sessions of a specific user across all instances.
     * This instance handles its local sockets directly; other instances receive the
     * message via Redis Pub/Sub (see publishToRedis contract).
     */
    public broadcastToUser(
        userId: string,
        event: AnyResponseWsEvent,
        replyTo?: string,
        excludeWs?: WebSocket,
    ): void {
        this.publishToRedis('broadcastToUser', { userId, event, replyTo });
        this._localBroadcastToUser(userId, event, replyTo, excludeWs);
    }

    private _localBroadcastToUser(
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
     * Refreshes the presence TTL for a connected socket.
     * Call this on every client ping so a short TTL does not expire live connections.
     */
    public async refreshPresence(ws: WebSocket): Promise<void> {
        const user = this.socketToUser.get(ws);
        const socketId = this.getSocketId(ws);
        if (!user || !socketId) return;

        const presenceKey = `presence:user:${user.userId}`;
        const presenceMember = `${this.instanceId}:${socketId}`;
        try {
            await this.redisService
                .getClient()
                .expire(presenceKey, WsServer.PRESENCE_TTL_S);
            logger.debug(
                `[WsServer] Refreshed presence TTL for ${user.username} (${presenceMember})`,
            );
        } catch (err) {
            logger.error(
                `[WsServer] Failed to refresh presence for ${user.userId}:`,
                err,
            );
        }
    }

    /**
     * Broadcasts an event to all authenticated users across all instances.
     * This instance handles its local sockets directly; other instances receive the
     * message via Redis Pub/Sub (see publishToRedis contract).
     */
    public broadcastToAll(event: AnyResponseWsEvent): void {
        this.publishToRedis('broadcastToAll', { event });
        this._localBroadcastToAll(event);
    }

    private _localBroadcastToAll(event: AnyResponseWsEvent): void {
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
        chatRoomsActiveGauge.set(this.channelSubscriptions.size);

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
            chatRoomsActiveGauge.set(this.channelSubscriptions.size);
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
        this.publishToRedis('broadcastToChannel', {
            channelId,
            event,
            replyTo,
        });
        this._localBroadcastToChannel(channelId, event, replyTo, excludeWs);
    }

    private _localBroadcastToChannel(
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
        this.publishToRedis('broadcastToServer', { serverId, event, replyTo });
        this._localBroadcastToServer(serverId, event, replyTo, excludeWs);
    }

    private _localBroadcastToServer(
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
        permissionCheck: {
            type: 'server' | 'channel';
            targetId?: string;
            permission: string;
        },
        replyTo?: string,
        excludeWs?: WebSocket,
    ): Promise<void> {
        this.publishToRedis('broadcastToServerWithPermission', {
            serverId,
            event,
            permissionCheck,
            replyTo,
        });
        await this._localBroadcastToServerWithPermission(
            serverId,
            event,
            permissionCheck,
            replyTo,
            excludeWs,
        );
    }

    private async _checkPermission(
        userId: string,
        permissionCheck: {
            type: 'server' | 'channel';
            targetId?: string;
            permission: string;
        },
        serverId: string,
    ): Promise<boolean> {
        if (permissionCheck.type === 'server') {
            return this.permissionService.hasPermission(
                new mongoose.Types.ObjectId(serverId),
                new mongoose.Types.ObjectId(userId),
                permissionCheck.permission,
            );
        } else if (
            permissionCheck.type === 'channel' &&
            permissionCheck.targetId
        ) {
            return this.permissionService.hasChannelPermission(
                new mongoose.Types.ObjectId(serverId),
                new mongoose.Types.ObjectId(userId),
                new mongoose.Types.ObjectId(permissionCheck.targetId),
                permissionCheck.permission,
            );
        }
        return false;
    }

    private async _localBroadcastToServerWithPermission(
        serverId: string,
        event: AnyResponseWsEvent,
        permissionCheck: {
            type: 'server' | 'channel';
            targetId?: string;
            permission: string;
        },
        replyTo?: string,
        excludeWs?: WebSocket,
    ): Promise<void> {
        const subscribers = this.serverSubscriptions.get(serverId);
        if (!subscribers || subscribers.size === 0) {
            logger.debug(
                `[WsServer] No subscribers for server ${serverId}. Skipping broadcast of ${event.type}.`,
            );
            return;
        }

        logger.debug(
            `[WsServer] Broadcasting ${event.type} to server ${serverId}. Found ${subscribers.size} total subscribers.`,
        );

        const recipients: WebSocket[] = [];
        const permissionCache = new Map<string, boolean>();

        for (const ws of subscribers) {
            if (ws === excludeWs || ws.readyState !== 1) {
                if (ws.readyState !== 1) {
                    logger.debug(
                        `[WsServer] Skip subscriber for server ${serverId}: readyState is ${ws.readyState}`,
                    );
                }
                continue;
            }

            const user = this.getAuthenticatedUser(ws);
            if (!user) {
                logger.debug(
                    `[WsServer] Skip subscriber for server ${serverId}: unauthenticated socket`,
                );
                continue;
            }

            let hasPermission = permissionCache.get(user.userId);
            if (hasPermission === undefined) {
                try {
                    hasPermission = await this._checkPermission(
                        user.userId,
                        permissionCheck,
                        serverId,
                    );
                    logger.debug(
                        `[WsServer] Permission check for user ${user.userId} on server ${serverId}: ${hasPermission}`,
                    );
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
                `[WsServer] Broadcast of ${event.type} to server ${serverId} completed. Sent to ${recipients.length} authorized subscribers.`,
            );
        } else {
            logger.debug(
                `[WsServer] Broadcast of ${event.type} to server ${serverId} skipped: 0 authorized subscribers found.`,
            );
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
        this.publishToRedis('sendToSocketById', { socketId, event, replyTo });
        this._localSendToSocketById(socketId, event, replyTo);
    }

    private _localSendToSocketById(
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
    private async removeConnection(ws: WebSocket) {
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
            const userSockets = this.connectionsByUserId.get(user.userId);
            if (userSockets) {
                userSockets.delete(ws);
                if (userSockets.size === 0) {
                    this.connectionsByUserId.delete(user.userId);
                    logger.info(
                        `[WsServer] User ${user.username} session disconnected (all local sessions closed)`,
                    );

                    const socketId = this.getSocketId(ws);
                    if (socketId) {
                        const presenceMember = `${this.instanceId}:${socketId}`;
                        const presenceKey = `presence:user:${user.userId}`;
                        const redis = this.redisService.getClient();

                        await redis
                            .multi()
                            .srem(presenceKey, presenceMember)
                            .scard(presenceKey)
                            .exec()
                            .then((results) => {
                                const countAfter =
                                    (results?.[1]?.[1] as number) || 0;
                                if (countAfter === 0) {
                                    logger.info(
                                        `[WsServer] User ${user.username} went offline globally`,
                                    );
                                    this.emit(
                                        'user:offline',
                                        user.userId,
                                        user.username,
                                    );
                                }
                            })
                            .catch((err) =>
                                logger.error(
                                    `[WsServer] Global presence update failed for ${user.userId}:`,
                                    err,
                                ),
                            );
                    }
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
        this.publishToRedis('broadcastToPresenceAudience', {
            friendIds,
            serverIds,
            event,
        });
        this._localBroadcastToPresenceAudience(
            friendIds,
            serverIds,
            event,
            excludeWs,
        );
    }

    private _localBroadcastToPresenceAudience(
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
