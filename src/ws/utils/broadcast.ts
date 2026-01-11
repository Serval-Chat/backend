import type { WebSocket } from 'ws';
import type { AnyResponseWsEvent } from '@/ws/protocol/envelope';
import type { IWsEnvelope } from '@/ws/protocol/envelope';
import * as crypto from 'node:crypto';

/**
 * Creates an envelope for a WebSocket message.
 * @param event - The event to wrap
 * @param replyTo - Optional message ID this is replying to
 * @returns Complete envelope ready to send
 */
export function createEnvelope(
    event: AnyResponseWsEvent,
    replyTo?: string,
): IWsEnvelope {
    return {
        id: crypto.randomUUID(),
        event,
        meta: {
            replyTo: replyTo || '',
            ts: Date.now(),
        },
    };
}

/**
 * Sends an event to a single WebSocket connection.
 * @param ws - WebSocket connection
 * @param event - Event to send
 * @param replyTo - Optional message ID this is replying to
 */
export function send(
    ws: WebSocket,
    event: AnyResponseWsEvent,
    replyTo?: string,
): void {
    if (ws.readyState !== ws.OPEN) return;

    const envelope = createEnvelope(event, replyTo);
    ws.send(JSON.stringify(envelope));
}

/**
 * Sends an event to multiple WebSocket connections.
 * @param sockets - Array of WebSocket connections
 * @param event - Event to send
 * @param replyTo - Optional message ID this is replying to
 */
export function sendToMany(
    sockets: WebSocket[],
    event: AnyResponseWsEvent,
    replyTo?: string,
): void {
    const envelope = createEnvelope(event, replyTo);
    const message = JSON.stringify(envelope);

    for (const ws of sockets) {
        if (ws.readyState === ws.OPEN) {
            ws.send(message);
        }
    }
}
