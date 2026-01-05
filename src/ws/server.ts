import 'reflect-metadata';
import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import type { Server as HttpServer } from 'http';
import type { EventMetadata } from './decorators';
import { EVENT_METADATA } from './decorators';
import { EventType } from './types';
import type { WebSocketFrame } from './types';

export class WsServer {
    private wss: WebSocketServer;
    private handlers: Map<
        EventType | string,
        { target: object; methodName: string }
    > = new Map();
    private connections: Set<WebSocket> = new Set();

    constructor(server: HttpServer) {
        this.wss = new WebSocketServer({ noServer: true });

        server.on('upgrade', (request, socket, head) => {
            const { pathname } = new URL(
                request.url || '',
                `http://${request.headers.host}`,
            );

            if (pathname === '/ws') {
                this.wss.handleUpgrade(request, socket, head, (ws) => {
                    this.wss.emit('connection', ws, request);
                });
            }
        });

        this.wss.on('connection', (ws: WebSocket) => {
            this.connections.add(ws);
            console.log(
                `New WebSocket connection. Total: ${this.connections.size}`,
            );

            ws.on('message', (data: string | Buffer) => {
                this.handleMessage(ws, data);
            });

            ws.on('close', () => {
                this.connections.delete(ws);
                console.log(
                    `WebSocket connection closed. Total: ${this.connections.size}`,
                );
            });
        });
    }

    /**
     * Registers a controller that uses @Event decorators.
     * @param controller The controller instance to register.
     */
    public registerController(controller: object) {
        const metadata: EventMetadata[] =
            Reflect.getMetadata(EVENT_METADATA, controller.constructor) || [];
        for (const meta of metadata) {
            this.handlers.set(meta.event, {
                target: controller,
                methodName: meta.methodName,
            });
        }
    }

    private handleMessage(ws: WebSocket, data: string | Buffer) {
        try {
            const messageStr = data.toString();
            const frame: WebSocketFrame = JSON.parse(messageStr);

            const eventValue = frame.event;
            const handler =
                this.handlers.get(eventValue) ||
                this.handlers.get(
                    EventType[eventValue as unknown as keyof typeof EventType],
                );

            if (handler) {
                const target = handler.target as Record<string, Function>;
                const method = target[handler.methodName];
                if (typeof method === 'function') {
                    method.call(target, ws, frame.payload);
                }
            } else {
                console.warn(`No handler for event: ${eventValue}`);
            }
        } catch (err) {
            console.error('Failed to handle WebSocket message:', err);
        }
    }
}
