import type { Server as HttpServer } from 'http';
import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import logger from '@/utils/logger';
import type { IWsUser } from './types';
import { inject, injectable } from 'inversify';
import { TYPES } from '@/di/types';
import type { WsDispatcher } from './dispatcher';
import type { IWsEnvelope } from './protocol/envelope';

/**
 * Server for WS
 */
@injectable()
export class WsServer {
    private wss!: WebSocketServer;
    private unauthenticatedConnections = new Set<WebSocket>();
    private authenticatedConnections = new Map<string, IWsUser>();

    constructor(
        @inject(TYPES.WsDispatcher) private dispatcher: WsDispatcher
    ) { }

    public initialize(server: HttpServer) {
        this.wss = new WebSocketServer({
            noServer: true,
            path: "/ws",
        });

        server.on("upgrade", (request, socket, head) => {
            const pathname = new URL(request.url || "", `http://${request.headers.host}`).pathname;

            if (pathname === "/ws") {
                this.wss.handleUpgrade(request, socket, head, (ws) => {
                    this.wss.emit("connection", ws, request);
                });
            }
        });

        this.wss.on("connection", (ws: WebSocket) => {
            logger.info("[WsServer] New connection established");
            this.unauthenticatedConnections.add(ws);

            // Register connection with dispatcher for unique ID assignment
            this.dispatcher.registerConnection(ws);

            ws.on("message", async (data) => {
                try {
                    const message: IWsEnvelope = JSON.parse(data.toString());
                    const authUser = this.getAuthenticatedUser(ws);
                    await this.dispatcher.dispatch(ws, message, authUser);
                } catch (error) {
                    logger.error("[WsServer] Failed to handle message:", error);
                }
            });

            ws.on("close", () => {
                logger.info("[WsServer] Connection closed");
                this.removeConnection(ws);
            });

            ws.on("error", (error) => {
                logger.error("[WsServer] WebSocket error:", error);
                this.removeConnection(ws);
            });
        });

        logger.info("[WsServer] WebSocket server initialized on /ws");
    }

    private getAuthenticatedUser(ws: WebSocket): IWsUser | undefined {
        for (const user of this.authenticatedConnections.values()) {
            if (user.socket === ws) return user;
        }
        return undefined;
    }

    /**
     * Removes a connection from all internal tracking structures.
     */
    private removeConnection(ws: WebSocket) {
        this.dispatcher.cleanup(ws);

        if (this.unauthenticatedConnections.has(ws)) {
            this.unauthenticatedConnections.delete(ws);
            return;
        }

        // Search in authenticated connections
        for (const [userId, user] of this.authenticatedConnections.entries()) {
            if (user.socket === ws) {
                this.authenticatedConnections.delete(userId);
                logger.debug(`[WsServer] Removed authenticated connection for user ${userId}`);
                break;
            }
        }
    }
}
