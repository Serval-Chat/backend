import { injectable, inject } from 'inversify';
import type { WebSocket } from 'ws';
import { TYPES } from '@/di/types';
import type { ILogger } from '@/di/interfaces/ILogger';
import type { IWsEnvelope } from '@/ws/protocol/envelope';
import * as crypto from 'node:crypto';
import {
    WS_CONTROLLER_METADATA,
    WS_EVENT_METADATA,
    WS_NEED_AUTH_METADATA,
    WS_DEDUP_METADATA,
    WS_RATE_LIMIT_METADATA,
    WS_VALIDATE_METADATA,
    WS_CACHE_METADATA,
    WS_BEFORE_METADATA,
    WS_AFTER_METADATA,
    WS_ON_ERROR_METADATA,
    WS_TIMEOUT_METADATA,
} from '@/ws/decorators';
import type { IWsUser } from '@/ws/types';
import { container } from '@/di/container';
import type { AnyResponseWsEvent } from '@/ws/protocol/envelope';
import type { IRedisService } from '@/di/interfaces/IRedisService';
import { wsErrorCodeForStatus } from '@/ws/protocol/error';
import type { WsErrorCode } from '@/ws/protocol/error';
import { send } from '@/ws/utils/broadcast';
import { ApiError } from '@/utils/ApiError';
import {
    websocketMessagesCounter,
    wsRateLimitRedisFailuresCounter,
} from '@/utils/metrics';

interface IEventHandlerInfo {
    instance: object;
    method: string;
}

interface IRateLimitEntry {
    points: number;
    resetAt: number;
}

interface ICacheEntry {
    value: unknown;
    expiresAt: number;
}

export const DEFAULT_HANDLER_TIMEOUT_MS = 10_000;

interface IConnectionMetadata {
    id: string;
    connectedAt: number;
    source?: string;
}

interface IDispatcherMetrics {
    messagesProcessed: number;
    rateLimitHits: number;
    cacheHits: number;
    cacheMisses: number;
    validationErrors: number;
    authErrors: number;
    duplicateMessages: number;
}

/**
 * Maximum number of message IDs to track per connection for deduplication.
 * Older IDs are evicted when this limit is reached.
 */
const MAX_DEDUP_CACHE_SIZE = 1000;

/**
 * Time-to-live for deduplication entries in milliseconds.
 * Messages older than this are automatically removed.
 */
const DEDUP_TTL_MS = 60000; // 1 minute

function describeEventName(type: unknown): string {
    return String(type)
        .replace(/[^\w.:-]/g, '?')
        .slice(0, 32);
}

/**
 * Manages WebSocket event dispatching and decorator execution.
 */
@injectable()
export class WsDispatcher {
    private handlers = new Map<string, IEventHandlerInfo>();

    // Use WeakMap to automatically clean up when connections are garbage collected
    private dedupCache = new WeakMap<WebSocket, Map<string, number>>();
    private connectionMetadata = new WeakMap<WebSocket, IConnectionMetadata>();

    private rateLimitCache = new Map<string, IRateLimitEntry>();
    private responseCache = new Map<string, ICacheEntry>();

    private metrics: IDispatcherMetrics = {
        messagesProcessed: 0,
        rateLimitHits: 0,
        cacheHits: 0,
        cacheMisses: 0,
        validationErrors: 0,
        authErrors: 0,
        duplicateMessages: 0,
    };

    private cleanupInterval?: NodeJS.Timeout;

    public constructor(
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.RedisService) private redisService: IRedisService,
    ) {
        this.startCleanupInterval();
    }

    /**
     * Discovers and registers all WebSocket controllers.
     */
    public registerControllers() {
        const controllers = container.getAll<object>(TYPES.WsController);

        for (const controller of controllers) {
            const ctrl = controller as { constructor: Function };
            const isController = Reflect.getMetadata(
                WS_CONTROLLER_METADATA,
                ctrl.constructor,
            );
            if (isController !== true) continue;

            const events =
                Reflect.getMetadata(WS_EVENT_METADATA, ctrl.constructor) ?? [];
            for (const { type, method } of events) {
                const existing = this.handlers.get(type);
                if (existing !== undefined) {
                    throw new Error(
                        `[WsDispatcher] Duplicate handler for '${type}': ` +
                            `${existing.instance.constructor.name}.${existing.method} ` +
                            `and ${ctrl.constructor.name}.${method as string}`,
                    );
                }

                this.handlers.set(type, {
                    instance: ctrl,
                    method: method as string,
                });
                this.logger.debug(
                    `[WsDispatcher] Registered handler for ${type}: ${ctrl.constructor.name}.${method}`,
                );
            }
        }
    }

    /**
     * Starts periodic cleanup of expired cache entries.
     */
    private startCleanupInterval() {
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredCaches();
        }, 30000); // Run cleanup every 30 seconds

        this.cleanupInterval.unref();
    }

    /**
     * Removes expired entries from rate limit and response caches.
     */
    private cleanupExpiredCaches() {
        const now = Date.now();

        // Cleanup response cache
        for (const [key, entry] of this.responseCache.entries()) {
            if (now > entry.expiresAt) {
                this.responseCache.delete(key);
            }
        }

        for (const [key, entry] of this.rateLimitCache.entries()) {
            if (now > entry.resetAt) {
                this.rateLimitCache.delete(key);
            }
        }

        this.logger.debug('[WsDispatcher] Cache cleanup completed', {
            rateLimitEntries: this.rateLimitCache.size,
            cacheEntries: this.responseCache.size,
            metrics: this.metrics,
        });
    }

    /**
     * Assigns a unique identifier to a WebSocket connection.
     */
    public registerConnection(ws: WebSocket, source?: string): void {
        this.connectionMetadata.set(ws, {
            id: crypto.randomUUID(),
            connectedAt: Date.now(),
            source,
        });
    }

    public getPreAuthKey(ws: WebSocket): string {
        const source = this.connectionMetadata.get(ws)?.source;
        if (source !== undefined && source !== '') return `src:${source}`;
        return `anon:${this.getConnectionId(ws)}`;
    }

    /**
     * Gets the unique identifier for a WebSocket connection.
     */
    private getConnectionId(ws: WebSocket): string {
        const metadata = this.connectionMetadata.get(ws);
        if (metadata !== undefined) {
            return metadata.id;
        }

        this.registerConnection(ws);
        const newMetadata = this.connectionMetadata.get(ws);
        return newMetadata?.id ?? 'unknown';
    }

    /**
     * Whether an event name resolves to a registered handler.
     */
    public hasHandler(type: string): boolean {
        return this.handlers.has(type);
    }

    /**
     * Dispatches an incoming WebSocket message to the appropriate handler.
     */
    public async dispatch(
        ws: WebSocket,
        envelope: IWsEnvelope,
        authenticatedUser?: IWsUser,
    ) {
        this.metrics.messagesProcessed++;

        const handlerInfo = this.handlers.get(envelope.event.type);

        websocketMessagesCounter.inc({
            event: handlerInfo === undefined ? 'unknown' : envelope.event.type,
            direction: 'inbound',
        });

        if (handlerInfo === undefined) {
            this.logger.debug(
                `[WsDispatcher] No handler for event: ${describeEventName(envelope.event.type)}`,
            );
            return;
        }

        const { instance, method } = handlerInfo;
        const target = instance.constructor.prototype;

        try {
            const needAuth = Reflect.getMetadata(
                WS_NEED_AUTH_METADATA,
                target,
                method,
            );
            if (needAuth === true && authenticatedUser === undefined) {
                this.metrics.authErrors++;
                this.sendError(
                    ws,
                    envelope,
                    'UNAUTHORIZED',
                    'Authentication required',
                );
                return;
            }

            const dedup = Reflect.getMetadata(
                WS_DEDUP_METADATA,
                target,
                method,
            );
            if (dedup === true) {
                if (this.isDuplicateMessage(ws, envelope.id)) {
                    this.metrics.duplicateMessages++;
                    this.logger.debug(
                        `[WsDispatcher] Duplicate message ignored: ${envelope.id}`,
                    );
                    return;
                }
                this.recordMessageId(ws, envelope.id);
            }

            const rateLimitConfig = Reflect.getMetadata(
                WS_RATE_LIMIT_METADATA,
                target,
                method,
            );
            if (rateLimitConfig !== undefined) {
                const { points, duration } = rateLimitConfig;
                const userId =
                    authenticatedUser?.userId ?? this.getPreAuthKey(ws);
                const rateLimitKey = `${userId}:${envelope.event.type}`;

                const isAllowed = await this.checkRateLimit(
                    rateLimitKey,
                    points,
                    duration,
                );
                if (isAllowed === false) {
                    this.metrics.rateLimitHits++;
                    this.sendError(
                        ws,
                        envelope,
                        'RATE_LIMIT',
                        'Rate limit exceeded',
                    );
                    return;
                }
            }

            const schema = Reflect.getMetadata(
                WS_VALIDATE_METADATA,
                target,
                method,
            );
            if (schema !== undefined) {
                const result = schema.safeParse(envelope.event.payload);
                if (result.success === false) {
                    this.metrics.validationErrors++;
                    this.sendError(
                        ws,
                        envelope,
                        'MALFORMED_MESSAGE',
                        'Validation failed',
                        { issues: result.error.issues },
                    );
                    return;
                }
                envelope.event.payload = result.data;
            }

            const beforeHooks =
                Reflect.getMetadata(WS_BEFORE_METADATA, target, method) ?? [];
            for (const hook of beforeHooks) {
                await hook.call(
                    instance,
                    envelope.event.payload,
                    authenticatedUser,
                );
            }

            const cacheConfig = Reflect.getMetadata(
                WS_CACHE_METADATA,
                target,
                method,
            );
            let result: unknown;

            if (cacheConfig !== undefined) {
                const cacheKey = this.getCacheKey(envelope, authenticatedUser);
                const cached = this.getFromCache(cacheKey);

                if (cached !== undefined) {
                    this.metrics.cacheHits++;
                    this.logger.debug(
                        `[WsDispatcher] Cache hit for ${envelope.event.type}`,
                    );
                    result = cached;
                } else {
                    this.metrics.cacheMisses++;
                    result = await this.executeHandler(
                        instance,
                        method,
                        envelope,
                        authenticatedUser,
                        ws,
                    );
                    this.storeInCache(cacheKey, result, cacheConfig.ttl);
                }
            } else {
                result = await this.executeHandler(
                    instance,
                    method,
                    envelope,
                    authenticatedUser,
                    ws,
                );
            }

            const afterHooks =
                Reflect.getMetadata(WS_AFTER_METADATA, target, method) ?? [];
            for (const hook of afterHooks) {
                await hook.call(instance, result, authenticatedUser);
            }

            if (result !== undefined) {
                this.sendResponse(ws, envelope, result);
            }
        } catch (error: unknown) {
            const err = error as Error;

            const clientFault =
                err instanceof ApiError &&
                err.status >= 400 &&
                err.status < 500;

            this.logger[clientFault ? 'debug' : 'error'](
                `[WsDispatcher] Error handling ${envelope.event.type}:`,
                {
                    error: err.message,
                    stack: clientFault ? undefined : err.stack,
                    eventType: envelope.event.type,
                    userId: authenticatedUser?.userId,
                },
            );

            // OnError hooks
            const onErrorHooks =
                Reflect.getMetadata(WS_ON_ERROR_METADATA, target, method) ?? [];
            for (const hook of onErrorHooks) {
                try {
                    await hook.call(instance, err, authenticatedUser);
                } catch (hookError) {
                    this.logger.error(
                        '[WsDispatcher] Error in OnError hook:',
                        hookError,
                    );
                }
            }

            // Send sanitized error to client
            if (err instanceof ApiError) {
                this.sendError(
                    ws,
                    envelope,
                    wsErrorCodeForStatus(err.status),
                    err.message,
                    err.details,
                );
            } else if (err.message === 'TIMEOUT') {
                this.sendError(ws, envelope, 'TIMEOUT', 'Request timed out');
            } else {
                this.sendError(
                    ws,
                    envelope,
                    'INTERNAL_ERROR',
                    'An error occurred while processing your request',
                );
            }
        }
    }

    /**
     * Executes a handler method with optional timeout and abort capability.
     */
    private async executeHandler(
        instance: object,
        method: string,
        envelope: IWsEnvelope,
        authenticatedUser?: IWsUser,
        ws?: WebSocket,
    ): Promise<unknown> {
        const target = instance.constructor.prototype;
        const declared = Reflect.getMetadata(
            WS_TIMEOUT_METADATA,
            target,
            method,
        );
        const timeoutMs =
            typeof declared === 'number'
                ? declared
                : DEFAULT_HANDLER_TIMEOUT_MS;

        const handlerMethod = (instance as Record<string, Function>)[method];
        if (typeof handlerMethod !== 'function') {
            throw new Error(`Method ${method} not found on controller`);
        }

        const abortController = new AbortController();

        let timeoutTimer: NodeJS.Timeout | undefined;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutTimer = setTimeout(() => {
                abortController.abort();
                reject(new Error('TIMEOUT'));
            }, timeoutMs);
        });

        const handlerPromise = Promise.resolve(
            handlerMethod.call(
                instance,
                envelope.event.payload,
                authenticatedUser,
                ws,
                abortController.signal,
            ),
        );

        handlerPromise.catch(() => undefined);

        try {
            return await Promise.race([handlerPromise, timeoutPromise]);
        } finally {
            if (timeoutTimer !== undefined) {
                clearTimeout(timeoutTimer);
            }
        }
    }

    /**
     * Checks if a message ID has been seen before for this connection.
     */
    private isDuplicateMessage(ws: WebSocket, messageId: string): boolean {
        const messageMap = this.dedupCache.get(ws);
        return messageMap?.has(messageId) ?? false;
    }

    /**
     * Records a message ID for deduplication.
     */
    private recordMessageId(ws: WebSocket, messageId: string): void {
        let messageMap = this.dedupCache.get(ws);
        if (messageMap === undefined) {
            messageMap = new Map();
            this.dedupCache.set(ws, messageMap);
        }

        // Evict oldest entry if cache is full
        if (messageMap.size >= MAX_DEDUP_CACHE_SIZE) {
            const firstKey = messageMap.keys().next().value;
            if (firstKey !== undefined) {
                messageMap.delete(firstKey);
            }
        }

        messageMap.set(messageId, Date.now());

        // Clean up expired entries
        const now = Date.now();
        for (const [msgId, timestamp] of messageMap.entries()) {
            if (now - timestamp > DEDUP_TTL_MS) {
                messageMap.delete(msgId);
            } else {
                break;
            }
        }
    }

    /**
     * Checks if a request passes the rate limit.
     *
     * @param key - Unique identifier for the rate limit bucket (e.g., userId:eventType)
     * @param maxPoints - Maximum number of requests allowed
     * @param durationMs - Time window in milliseconds
     * @returns true if request is allowed, false if rate limit exceeded
     */
    private async checkRateLimit(
        key: string,
        maxPoints: number,
        durationMs: number,
    ): Promise<boolean> {
        const client = this.redisService.getClient();
        const redisKey = `ws:rl:${key}`;

        try {
            const count = await client.incr(redisKey);
            if (count === 1) {
                await client.pexpire(redisKey, durationMs);
            }
            return count <= maxPoints;
        } catch (err) {
            this.logger.error(
                '[WsDispatcher] checkRateLimit failed, falling back to restrictive in-memory limit:',
                err,
            );

            wsRateLimitRedisFailuresCounter.inc();

            const now = Date.now();
            let entry = this.rateLimitCache.get(key);
            if (!entry || now > entry.resetAt) {
                entry = { points: 0, resetAt: now + durationMs };
            }
            entry.points += 1;
            this.rateLimitCache.set(key, entry);

            const fallbackPoints = Math.max(1, Math.floor(maxPoints / 2));
            return entry.points <= fallbackPoints;
        }
    }

    /**
     * Generates a cache key for a request.
     */
    private getCacheKey(
        envelope: IWsEnvelope,
        authenticatedUser?: IWsUser,
    ): string {
        const userId = authenticatedUser?.userId ?? 'anonymous';
        const eventType = envelope.event.type;

        const payloadHash = crypto
            .createHash('sha256')
            .update(JSON.stringify(envelope.event.payload))
            .digest('hex');

        return `${eventType}:${userId}:${payloadHash}`;
    }

    /**
     * Retrieves a value from the response cache if not expired.
     */
    private getFromCache(key: string): unknown | undefined {
        const entry = this.responseCache.get(key);
        if (entry === undefined) return undefined;

        if (Date.now() > entry.expiresAt) {
            this.responseCache.delete(key);
            return undefined;
        }

        return entry.value;
    }

    /**
     * Stores a value in the response cache with TTL.
     */
    private storeInCache(key: string, value: unknown, ttlMs: number): void {
        this.responseCache.set(key, {
            value,
            expiresAt: Date.now() + ttlMs,
        });
    }

    /**
     * Sends a successful response to the client.
     * Maps request event types to their corresponding response types.
     */
    private sendResponse(
        ws: WebSocket,
        requestEnvelope: IWsEnvelope,
        payload: unknown,
    ) {
        const responseType = this.getResponseType(requestEnvelope.event.type);

        send(
            ws,
            { type: responseType, payload } as AnyResponseWsEvent,
            requestEnvelope.id,
        );
        websocketMessagesCounter.inc({
            event: responseType,
            direction: 'outbound',
        });
    }

    /**
     * Maps a request event type to its corresponding response type.
     *
     * @param requestType - The incoming event type
     * @returns The response event type
     */
    private getResponseType(requestType: string): string {
        const typeMap: Record<string, string> = {
            // Core
            ping: 'pong',
            authenticate: 'authenticated',
            // DM Messages
            send_message_dm: 'message_dm_sent',
            edit_message_dm: 'message_dm_edited',
            delete_message_dm: 'message_dm_deleted',
            mark_dm_read: 'dm_unread_updated',
            // Server Messages
            join_server: 'server_joined',
            join_channel: 'channel_joined',
            send_message_server: 'message_server_sent',
            edit_message_server: 'message_server_edited',
            delete_message_server: 'message_server_deleted',
            mark_channel_read: 'channel_unread_updated',
            join_voice: 'voice_joined',
            // Presence & Status
            set_status: 'status_updated',
            // Reactions
            add_reaction: 'reaction_added',
            remove_reaction: 'reaction_removed',
        };

        const val = typeMap[requestType];
        if (val !== undefined) {
            return val;
        }

        return `${requestType}_response`;
    }

    /**
     * Sends an error response to the client.
     * Error details are sanitized to prevent information disclosure.
     */
    private sendError(
        ws: WebSocket,
        requestEnvelope: IWsEnvelope,
        code: string,
        message: string,
        details?: unknown,
    ) {
        const errorEvent: AnyResponseWsEvent = {
            type: 'error',
            payload: {
                code: code as WsErrorCode,
                details:
                    details === undefined
                        ? { message }
                        : { message, data: details },
            },
        };

        send(ws, errorEvent, requestEnvelope.id);
        websocketMessagesCounter.inc({ event: 'error', direction: 'outbound' });
    }

    /**
     * Returns current dispatcher metrics.
     */
    public getMetrics(): Readonly<IDispatcherMetrics> {
        return { ...this.metrics };
    }

    /**
     * Resets all metrics to zero.
     */
    public resetMetrics(): void {
        this.metrics = {
            messagesProcessed: 0,
            rateLimitHits: 0,
            cacheHits: 0,
            cacheMisses: 0,
            validationErrors: 0,
            authErrors: 0,
            duplicateMessages: 0,
        };
    }

    /**
     * Cleans up resources associated with a disconnected WebSocket.
     */
    public cleanup(ws: WebSocket): void {
        this.dedupCache.delete(ws);
        this.connectionMetadata.delete(ws);
        this.logger.debug('[WsDispatcher] Cleaned up connection resources');
    }

    /**
     * Stops the cleanup interval and releases resources.
     */
    public destroy(): void {
        if (this.cleanupInterval !== undefined) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = undefined;
        }
        this.logger.info('[WsDispatcher] Dispatcher destroyed');
    }
}
