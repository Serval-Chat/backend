import type { Server, Socket } from 'socket.io';
import type { Container } from 'inversify';
import { EVENT_METADATA, GATEWAY_METADATA } from '@/realtime/core/decorators';
import type {
    EventHandlerMetadata,
    GatewayMetadata,
    SocketContext,
} from '@/realtime/core/types';
import logger from '@/utils/logger';

// RealTime dispatcher
//
// Handles the registration and dispatching of WebSocket events to gateway handlers
// Manages dependency injection, validation, and error handling for all events
export class RealTimeDispatcher {
    constructor(private container: Container) {}

    // Registers all gateway classes with the Socket.IO server
    //
    // @param io - The Socket.IO server instance
    // @param gateways - List of gateway classes to register
    registerGateways(io: Server, gateways: Function[]) {
        gateways.forEach((GatewayClass) => {
            const gatewayMetadata: GatewayMetadata = Reflect.getMetadata(
                GATEWAY_METADATA,
                GatewayClass,
            );
            const events: EventHandlerMetadata[] =
                Reflect.getMetadata(EVENT_METADATA, GatewayClass) || [];

            if (!gatewayMetadata) {
                logger.warn(
                    `Class ${GatewayClass.name} is not decorated with @Gateway`,
                );
                return;
            }

            const namespace = io.of(gatewayMetadata.namespace || '/');

            namespace.on('connection', async (socket: Socket) => {
                // Resolve the gateway instance for this connection (or singleton depending on DI config)
                // Ideally, gateways should be singletons or transient. If they are stateful per socket, we need a factory.
                // For now, assuming singletons or stateless handlers.
                let gatewayInstance: Record<string, Function>;
                try {
                    gatewayInstance = this.container.resolve(
                        GatewayClass as new (
                            ...args: unknown[]
                        ) => Record<string, Function>,
                    );
                } catch (error) {
                    logger.error(
                        `Failed to resolve gateway ${GatewayClass.name}:`,
                        error,
                    );
                    return;
                }

                // Attach user to context if authenticated
                // This assumes auth middleware has already run and attached user to socket
                const user = (
                    socket as unknown as { user: SocketContext['user'] }
                ).user;
                const ctx: SocketContext = { socket, user };

                // Handle connection hook
                if (typeof gatewayInstance.handleConnection === 'function') {
                    try {
                        await gatewayInstance.handleConnection(ctx);
                    } catch (error: unknown) {
                        const err = error as Error;
                        logger.error(
                            `[Socket Failure] Connection Hook: ${GatewayClass.name}`,
                            {
                                reason: err.message || 'Connection hook failed',
                                socketId: ctx.socket.id,
                                userId: ctx.user?.id,
                                stack: err.stack,
                            },
                        );
                    }
                }

                events.forEach(({ event, schema, method }) => {
                    socket.on(
                        event,
                        async (
                            payload: unknown,
                            ack?: (data: unknown) => void,
                        ) => {
                            try {
                                // 1. Validation
                                let validatedPayload = payload;
                                if (schema) {
                                    const result = schema.safeParse(payload);
                                    if (!result.success) {
                                        logger.warn(
                                            `[Socket Failure] Event: ${event}`,
                                            {
                                                reason: 'Validation failed',
                                                socketId: ctx.socket.id,
                                                userId: ctx.user?.id,
                                                validationErrors:
                                                    result.error.issues,
                                            },
                                        );
                                        if (ack) {
                                            return ack({
                                                ok: false,
                                                error: 'Validation failed',
                                                details: result.error.issues,
                                            });
                                        }
                                        return;
                                    }
                                    validatedPayload = result.data;
                                }

                                // 2. Execution
                                if (
                                    typeof gatewayInstance[method] !==
                                    'function'
                                ) {
                                    throw new Error(
                                        `Method ${method} not found on gateway ${GatewayClass.name}`,
                                    );
                                }

                                const result = await gatewayInstance[method](
                                    ctx,
                                    validatedPayload,
                                );

                                // 3. Acknowledgment
                                if (ack && result !== undefined) {
                                    ack(result);
                                }
                            } catch (error: unknown) {
                                const err = error as Error;
                                logger.error(
                                    `[Socket Failure] Event: ${event}`,
                                    {
                                        reason:
                                            err.message ||
                                            'Internal execution error',
                                        socketId: ctx.socket.id,
                                        userId: ctx.user?.id,
                                        stack: err.stack,
                                    },
                                );
                                if (ack) {
                                    ack({
                                        ok: false,
                                        error: 'Internal server error',
                                    });
                                }
                            }
                        },
                    );
                });
            });
        });
    }
}
