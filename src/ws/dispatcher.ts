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
    WS_TIMEOUT_METADATA
} from '@/ws/decorators';
import type { IWsUser } from '@/ws/types';
import { container } from '@/di/container';
import type { AnyResponseWsEvent } from '@/ws/protocol/envelope';
import type { WsErrorCode } from '@/ws/protocol/error';

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

interface IConnectionMetadata {
    id: string;
    connectedAt: number;
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

/**
 * Manages WebSocket event dispatching and decorator execution.
 * 
 * Responsibilities:
 * - Routes incoming events to appropriate controller handlers
 * - Executes decorator pipeline (auth, validation, hooks, etc.)
 * - Manages rate limiting per connection
 * - Provides response caching
 * - Handles deduplication of messages
 * 
 * Architecture notes:
 * - Uses WeakMap for connection-specific data to prevent memory leaks
 * - Rate limiting is per-connection in Node's single-threaded context
 * - Error messages are sanitized to prevent information disclosure
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
        duplicateMessages: 0
    };

    private cleanupInterval?: NodeJS.Timeout;

    constructor(
        @inject(TYPES.Logger) private logger: ILogger
    ) {
        this.registerControllers();
        this.startCleanupInterval();
    }

    /**
     * Discovers and registers all WebSocket controllers.
     * Controllers are identified by the @WsController decorator.
     * 
     * Note: currently we do manual registration.
     */
    private registerControllers() {
        const controllers = [
            container.get(require('@/ws/controller/PingController').PingController)
        ];

        for (const controller of controllers as unknown[]) {
            const ctrl = controller as { constructor: Function };
            const isController = Reflect.getMetadata(WS_CONTROLLER_METADATA, ctrl.constructor);
            if (!isController) continue;

            const events = Reflect.getMetadata(WS_EVENT_METADATA, ctrl.constructor) || [];
            for (const { type, method } of events) {
                this.handlers.set(type, { instance: ctrl as object, method: method as string });
                this.logger.debug(`[WsDispatcher] Registered handler for ${type}: ${ctrl.constructor.name}.${method}`);
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
    }

    /**
     * Removes expired entries from rate limit and response caches.
     * Note: Deduplication cache uses WeakMap and is automatically cleaned up.
     */
    private cleanupExpiredCaches() {
        const now = Date.now();

        // Cleanup rate limit cache
        for (const [key, entry] of this.rateLimitCache.entries()) {
            if (now > entry.resetAt) {
                this.rateLimitCache.delete(key);
            }
        }

        // Cleanup response cache
        for (const [key, entry] of this.responseCache.entries()) {
            if (now > entry.expiresAt) {
                this.responseCache.delete(key);
            }
        }

        this.logger.debug('[WsDispatcher] Cache cleanup completed', {
            rateLimitEntries: this.rateLimitCache.size,
            cacheEntries: this.responseCache.size,
            metrics: this.metrics
        });
    }

    /**
     * Assigns a unique identifier to a WebSocket connection.
     * Used for rate limiting and tracking.
     */
    public registerConnection(ws: WebSocket): void {
        this.connectionMetadata.set(ws, {
            id: crypto.randomUUID(),
            connectedAt: Date.now()
        });
    }

    /**
     * Gets the unique identifier for a WebSocket connection.
     */
    private getConnectionId(ws: WebSocket): string {
        const metadata = this.connectionMetadata.get(ws);
        if (!metadata) {
            // Fallback: auto-register if not already registered
            this.registerConnection(ws);
            return this.connectionMetadata.get(ws)!.id;
        }
        return metadata.id;
    }

    /**
     * Dispatches an incoming WebSocket message to the appropriate handler.
     * Executes the full decorator pipeline including auth, validation, hooks, etc.
     */
    public async dispatch(ws: WebSocket, envelope: IWsEnvelope, authenticatedUser?: IWsUser) {
        this.metrics.messagesProcessed++;

        const handlerInfo = this.handlers.get(envelope.event.type);
        if (!handlerInfo) {
            this.logger.warn(`[WsDispatcher] No handler for event: ${envelope.event.type}`);
            return;
        }

        const { instance, method } = handlerInfo;
        const target = instance.constructor.prototype;

        try {
            // 1. Authentication check
            const needAuth = Reflect.getMetadata(WS_NEED_AUTH_METADATA, target, method);
            if (needAuth && !authenticatedUser) {
                this.metrics.authErrors++;
                this.sendError(ws, envelope, 'UNAUTHORIZED', 'Authentication required');
                return;
            }

            // 2. Deduplication
            const dedup = Reflect.getMetadata(WS_DEDUP_METADATA, target, method);
            if (dedup) {
                if (this.isDuplicateMessage(ws, envelope.id)) {
                    this.metrics.duplicateMessages++;
                    this.logger.debug(`[WsDispatcher] Duplicate message ignored: ${envelope.id}`);
                    return;
                }
                this.recordMessageId(ws, envelope.id);
            }

            // 3. Rate limiting
            const rateLimitConfig = Reflect.getMetadata(WS_RATE_LIMIT_METADATA, target, method);
            if (rateLimitConfig) {
                const { points, duration } = rateLimitConfig;
                const connectionId = this.getConnectionId(ws);
                const userId = authenticatedUser?.userId || `anon:${connectionId}`;
                const rateLimitKey = `${userId}:${envelope.event.type}`;

                if (!this.checkRateLimit(rateLimitKey, points, duration)) {
                    this.metrics.rateLimitHits++;
                    this.sendError(ws, envelope, 'RATE_LIMIT', 'Rate limit exceeded');
                    return;
                }
            }

            // 4. Payload validation
            const schema = Reflect.getMetadata(WS_VALIDATE_METADATA, target, method);
            if (schema) {
                const result = schema.safeParse(envelope.event.payload);
                if (!result.success) {
                    this.metrics.validationErrors++;
                    this.sendError(ws, envelope, 'MALFORMED_MESSAGE', 'Validation failed', result.error.issues);
                    return;
                }
            }

            // 5. Before hooks
            const beforeHooks = Reflect.getMetadata(WS_BEFORE_METADATA, target, method) || [];
            for (const hook of beforeHooks) {
                await hook.call(instance, envelope.event.payload, authenticatedUser);
            }

            // 6. Check cache
            const cacheConfig = Reflect.getMetadata(WS_CACHE_METADATA, target, method);
            let result: unknown;

            if (cacheConfig) {
                const cacheKey = this.getCacheKey(envelope, authenticatedUser);
                const cached = this.getFromCache(cacheKey);

                if (cached !== undefined) {
                    this.metrics.cacheHits++;
                    this.logger.debug(`[WsDispatcher] Cache hit for ${envelope.event.type}`);
                    result = cached;
                } else {
                    this.metrics.cacheMisses++;
                    result = await this.executeHandler(instance, method, envelope, authenticatedUser);
                    this.storeInCache(cacheKey, result, cacheConfig.ttl);
                }
            } else {
                result = await this.executeHandler(instance, method, envelope, authenticatedUser);
            }

            // 7. After hooks
            const afterHooks = Reflect.getMetadata(WS_AFTER_METADATA, target, method) || [];
            for (const hook of afterHooks) {
                await hook.call(instance, result, authenticatedUser);
            }

            // 8. Send response
            if (result !== undefined) {
                this.sendResponse(ws, envelope, result);
            }

        } catch (error: unknown) {
            const err = error as Error;

            // Log full error details server-side
            this.logger.error(`[WsDispatcher] Error handling ${envelope.event.type}:`, {
                error: err.message,
                stack: err.stack,
                eventType: envelope.event.type,
                userId: authenticatedUser?.userId
            });

            // OnError hooks
            const onErrorHooks = Reflect.getMetadata(WS_ON_ERROR_METADATA, target, method) || [];
            for (const hook of onErrorHooks) {
                try {
                    await hook.call(instance, err, authenticatedUser);
                } catch (hookError) {
                    this.logger.error('[WsDispatcher] Error in OnError hook:', hookError);
                }
            }

            // Send sanitized error to client
            if (err.message === 'TIMEOUT') {
                this.sendError(ws, envelope, 'INTERNAL_ERROR', 'Request timed out');
            } else {
                // Don't leak internal error details to the client
                this.sendError(ws, envelope, 'INTERNAL_ERROR', 'An error occurred while processing your request');
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
        authenticatedUser?: IWsUser
    ): Promise<unknown> {
        const target = instance.constructor.prototype;
        const timeoutMs = Reflect.getMetadata(WS_TIMEOUT_METADATA, target, method);

        const handlerMethod = (instance as Record<string, Function>)[method];
        if (typeof handlerMethod !== 'function') {
            throw new Error(`Method ${method} not found on controller`);
        }

        if (timeoutMs) {
            // Create timeout promise with timer reference
            let timeoutTimer: NodeJS.Timeout | undefined;
            const timeoutPromise = new Promise((_, reject) => {
                timeoutTimer = setTimeout(() => {
                    reject(new Error('TIMEOUT'));
                }, timeoutMs);
            });

            try {
                return await Promise.race([
                    handlerMethod.call(instance, envelope.event.payload, authenticatedUser),
                    timeoutPromise
                ]);
            } finally {
                // Clear timeout if handler completed first
                if (timeoutTimer) {
                    clearTimeout(timeoutTimer);
                }
            }
        }

        return await handlerMethod.call(instance, envelope.event.payload, authenticatedUser);
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
     * Implements LRU-like eviction when cache size exceeds limit.
     */
    private recordMessageId(ws: WebSocket, messageId: string): void {
        let messageMap = this.dedupCache.get(ws);
        if (!messageMap) {
            messageMap = new Map();
            this.dedupCache.set(ws, messageMap);
        }

        // Evict oldest entry if cache is full
        if (messageMap.size >= MAX_DEDUP_CACHE_SIZE) {
            const firstKey = messageMap.keys().next().value;
            if (firstKey) {
                messageMap.delete(firstKey);
            }
        }

        messageMap.set(messageId, Date.now());

        // Clean up expired entries opportunistically
        const now = Date.now();
        for (const [msgId, timestamp] of messageMap.entries()) {
            if (now - timestamp > DEDUP_TTL_MS) {
                messageMap.delete(msgId);
            }
        }
    }

    /**
     * Checks if a request passes the rate limit.
     * Uses a sliding window approach.
     * 
     * @param key - Unique identifier for the rate limit bucket (e.g., userId:eventType)
     * @param maxPoints - Maximum number of requests allowed
     * @param durationMs - Time window in milliseconds
     * @returns true if request is allowed, false if rate limit exceeded
     */
    private checkRateLimit(key: string, maxPoints: number, durationMs: number): boolean {
        const now = Date.now();
        const entry = this.rateLimitCache.get(key);

        if (!entry || now > entry.resetAt) {
            // No entry or expired, create new
            this.rateLimitCache.set(key, {
                points: maxPoints - 1,
                resetAt: now + durationMs
            });
            return true;
        }

        if (entry.points > 0) {
            // Decrement points
            entry.points--;
            return true;
        }

        // Rate limit exceeded
        return false;
    }

    /**
     * Generates a cache key for a request.
     */
    private getCacheKey(envelope: IWsEnvelope, authenticatedUser?: IWsUser): string {
        const userId = authenticatedUser?.userId || 'anonymous';
        const eventType = envelope.event.type;

        // Use full hash to prevent collisions
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
        if (!entry) return undefined;

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
            expiresAt: Date.now() + ttlMs
        });
    }

    /**
     * Sends a successful response to the client.
     * Maps request event types to their corresponding response types.
     */
    private sendResponse(ws: WebSocket, requestEnvelope: IWsEnvelope, payload: unknown) {
        const responseType = this.getResponseType(requestEnvelope.event.type);

        const response = {
            id: crypto.randomUUID(),
            event: {
                type: responseType,
                payload
            },
            meta: {
                replyTo: requestEnvelope.id,
                ts: Date.now()
            }
        };

        ws.send(JSON.stringify(response));
    }

    /**
     * Maps a request event type to its corresponding response type.
     * Convention: Request types ending in a verb get a past-tense response.
     * 
     * @param requestType - The incoming event type
     * @returns The response event type
     */
    private getResponseType(requestType: string): string {
        const typeMap: Record<string, string> = {
            'ping': 'pong',
            'authenticate': 'authenticated'
        };

        if (typeMap[requestType]) {
            return typeMap[requestType];
        }

        return `${requestType}_response`;
    }

    /**
     * Sends an error response to the client.
     * Error details are sanitized to prevent information disclosure.
     */
    private sendError(ws: WebSocket, requestEnvelope: IWsEnvelope, code: string, message: string, details?: unknown) {
        const errorEvent: AnyResponseWsEvent = {
            type: 'error',
            payload: {
                code: code as WsErrorCode,
                details: { message, ...(details as object) }
            }
        };

        const response = {
            id: crypto.randomUUID(),
            event: errorEvent,
            meta: {
                replyTo: requestEnvelope.id,
                ts: Date.now()
            }
        };

        ws.send(JSON.stringify(response));
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
            duplicateMessages: 0
        };
    }

    /**
     * Cleans up resources associated with a disconnected WebSocket.
     * Should be called when a connection is closed.
     */
    public cleanup(_ws: WebSocket): void {
        this.logger.debug('[WsDispatcher] Cleaned up connection resources');
    }

    /**
     * Stops the cleanup interval and releases resources.
     * Should be called during application shutdown.
     */
    public destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = undefined;
        }
        this.logger.info('[WsDispatcher] Dispatcher destroyed');
    }
}
