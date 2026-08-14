import type { WebSocket } from 'ws';
import type { AnyResponseWsEvent } from '@/ws/protocol/envelope';
import type { IWsEnvelope } from '@/ws/protocol/envelope';
import * as crypto from 'node:crypto';
import logger from '@/utils/logger';
import { websocketBackpressureDropsCounter } from '@/utils/metrics';

export const BACKPRESSURE_THRESHOLD_BYTES = 4 * 1024 * 1024;

function isBackedUp(ws: WebSocket): boolean {
    if (
        typeof ws.bufferedAmount !== 'number' ||
        ws.bufferedAmount <= BACKPRESSURE_THRESHOLD_BYTES
    ) {
        return false;
    }

    logger.warn(
        `[WsServer] Terminating socket: ${ws.bufferedAmount} bytes buffered, exceeding the ${BACKPRESSURE_THRESHOLD_BYTES} byte threshold`,
    );
    websocketBackpressureDropsCounter.inc();
    ws.terminate();
    return true;
}

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
            replyTo: replyTo ?? '',
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
    if (isBackedUp(ws)) return;

    const envelope = createEnvelope(event, replyTo);
    ws.send(JSON.stringify(envelope), (err) => {
        if (err) {
            logger.warn(
                `[WsServer] Send failed for event '${event.type}': ${err.message}`,
            );
        }
    });
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
        if (ws.readyState === ws.OPEN && !isBackedUp(ws)) {
            ws.send(message, (err) => {
                if (err) {
                    logger.warn(
                        `[WsServer] sendToMany failed for event '${event.type}': ${err.message}`,
                    );
                }
            });
        }
    }
}
