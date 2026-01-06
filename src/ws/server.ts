import type { Server as HttpServer } from 'http';
import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import logger from '@/utils/logger';

/**
 * Server for WS
 */
export class WsServer {
    private wss: WebSocketServer;

    constructor(server: HttpServer) {
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

            ws.on("close", () => {
                logger.info("[WsServer] Connection closed");
            });

            ws.on("error", (error) => {
                logger.error("[WsServer] WebSocket error:", error);
            });
        });

        logger.info("[WsServer] WebSocket server initialized on /ws");
    }
}
