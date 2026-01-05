import type { WebSocket } from 'ws';
import { EventType, FrameType } from './types';
import type { WebSocketFrame } from './types';

export class WsSender {
    /**
     * Sends a DEBUG_PONG event.
     * @param ws The WebSocket connection.
     * @param payload The pong payload.
     */
    public sendPongEvent(
        ws: WebSocket,
        payload: { timestamp: number; message: string },
    ) {
        this.send(ws, EventType.DEBUG_PONG, payload);
    }

    /**
     * Sends a JSON-encoded frame to a client.
     * @param ws The WebSocket connection.
     * @param event The event type to send.
     * @param payload The payload to include in the frame.
     */
    private send(ws: WebSocket, event: EventType, payload: unknown = {}) {
        try {
            const frame: WebSocketFrame = {
                type: FrameType.EVENT,
                event: event,
                payload: payload,
            };

            ws.send(JSON.stringify(frame));
        } catch (err) {
            console.error('Failed to send WebSocket message:', err);
        }
    }
}
