import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import type { Server as HttpServer } from 'http';
import type { EventMetadata } from './decorators';
import { EVENT_METADATA } from './decorators';
import { EventType, WebSocketFrame } from './types';
import * as protobuf from 'protobufjs';
import path from 'path';

export class WsServer {
    private wss: WebSocketServer;
    private handlers: Map<EventType | string, { target: object; methodName: string }> = new Map();
    private connections: Set<WebSocket> = new Set();
    private protoRoot: protobuf.Root | null = null;
    private frameType: protobuf.Type | null = null;

    constructor(server: HttpServer) {
        this.wss = new WebSocketServer({ noServer: true });
        this.loadProto();

        server.on('upgrade', (request, socket, head) => {
            const { pathname } = new URL(request.url || '', `http://${request.headers.host}`);

            if (pathname === '/ws') {
                this.wss.handleUpgrade(request, socket, head, (ws) => {
                    this.wss.emit('connection', ws, request);
                });
            }
        });

        this.wss.on('connection', (ws: WebSocket) => {
            this.connections.add(ws);
            console.log(`New WebSocket connection. Total: ${this.connections.size}`);

            ws.on('message', (data: Buffer) => {
                this.handleMessage(ws, data);
            });

            ws.on('close', () => {
                this.connections.delete(ws);
                console.log(`WebSocket connection closed. Total: ${this.connections.size}`);
            });
        });
    }

    private async loadProto() {
        try {
            this.protoRoot = await protobuf.load(path.join(__dirname, 'websocket.proto'));
            this.frameType = this.protoRoot.lookupType('WebSocketFrame');
            console.log('Protobuf definitions loaded successfully');
        } catch (err) {
            console.error('Failed to load Protobuf definitions:', err);
        }
    }

    /**
     * Registers a controller that uses @Event decorators.
     * @param controller The controller instance to register.
     */
    public registerController(controller: object) {
        const metadata: EventMetadata[] = Reflect.getMetadata(EVENT_METADATA, controller.constructor) || [];
        for (const meta of metadata) {
            this.handlers.set(meta.event, { target: controller, methodName: meta.methodName });
        }
    }

    /**
     * Sends a Protobuf-encoded frame to a client.
     * @param ws The WebSocket connection.
     * @param event The event type to send.
     * @param payload The payload to include in the frame.
     */
    public send(ws: WebSocket, event: EventType, payload: unknown = {}) {
        if (!this.frameType) {
            console.error('WebSocket frame type not loaded');
            return;
        }

        try {
            const frameData = {
                type: 1, // EVENT
                event: event,
                payload: payload instanceof Buffer ? payload : Buffer.from(JSON.stringify(payload)),
            };

            const errMsg = this.frameType.verify(frameData);
            if (errMsg) throw Error(errMsg);

            const message = this.frameType.create(frameData);
            const buffer = this.frameType.encode(message).finish();
            ws.send(buffer);
        } catch (err) {
            console.error('Failed to send WebSocket message:', err);
        }
    }

    private handleMessage(ws: WebSocket, data: Buffer) {
        if (!this.frameType) {
            console.error('WebSocket frame type not loaded');
            return;
        }

        try {
            // Decode the Protobuf message
            const message = this.frameType.decode(data);
            const frame = this.frameType.toObject(message, {
                enums: String, // Keep enums as strings for easier mapping if needed, or keep as numbers
                longs: String,
                bytes: Buffer,
            });

            // Map the event (which could be a string if 'enums: String' is used, or a number)
            const eventValue = frame.event as string | number;

            const handler = this.handlers.get(eventValue) || this.handlers.get(EventType[eventValue as keyof typeof EventType]);

            if (handler) {
                const target = handler.target as Record<string, Function>;
                const method = target[handler.methodName];
                if (typeof method === 'function') {
                    method.call(target, ws, frame.payload as Buffer);
                }
            } else {
                console.warn(`No handler for event: ${eventValue}`);
            }
        } catch (err) {
            console.error('Failed to handle WebSocket message:', err);
        }
    }
}
