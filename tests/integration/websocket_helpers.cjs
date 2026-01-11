/**
 * WebSocket Integration Test Helpers
 */
const WebSocket = require('ws');
const crypto = require('node:crypto');

/**
 * Creates and authenticates a WebSocket client
 * @param {import('http').Server} server - The HTTP server instance
 * @param {string} token - The JWT auth token
 * @returns {Promise<WebSocket>} - Resolves with the authenticated WebSocket
 */
function createAuthenticatedClient(server, token) {
    return new Promise((resolve, reject) => {
        const address = server.address();
        const port = typeof address === 'object' ? address.port : address;
        const wsUrl = `ws://localhost:${port}/ws`;

        const ws = new WebSocket(wsUrl);
        ws.messageQueue = [];

        const onOpen = () => {
            // Send authentication frame
            const authEnvelope = {
                id: crypto.randomUUID(),
                event: {
                    type: 'authenticate',
                    payload: { token }
                }
            };
            ws.send(JSON.stringify(authEnvelope));
        };

        const onMessage = (data) => {
            try {
                const envelope = JSON.parse(data.toString());
                // Buffer all messages
                ws.messageQueue.push(envelope);

                if (envelope.event && envelope.event.type === 'authenticated') {
                    ws.authenticated = true;
                    resolve(ws);
                } else if (envelope.event && envelope.event.type === 'error' && !ws.authenticated) {
                    reject(new Error(`Authentication failed: ${envelope.event.payload?.details?.message || 'Unknown error'}`));
                }
            } catch (err) {
            }
        };

        ws.on('open', onOpen);
        ws.on('message', onMessage);

        ws.on('error', (err) => {
            reject(err);
        });
    });
}

/**
 * Sends a WebSocket event
 * @param {WebSocket} ws 
 * @param {string} type 
 * @param {object} payload 
 * @param {string} [replyTo] 
 */
function sendEvent(ws, type, payload, replyTo) {
    const envelope = {
        id: crypto.randomUUID(),
        event: {
            type,
            payload
        },
        meta: replyTo ? { replyTo } : undefined
    };
    ws.send(JSON.stringify(envelope));
}

/**
 * Waits for a specific event type
 * @param {WebSocket} ws 
 * @param {string} eventType 
 * @param {number} timeoutMs 
 * @returns {Promise<any>} - Resolves with the event payload
 */
function waitForEvent(ws, eventType, timeoutMs = 2000) {
    return new Promise((resolve, reject) => {
        // 1. Check if event is already in the queue
        if (ws.messageQueue) {
            const index = ws.messageQueue.findIndex(m => m.event && m.event.type === eventType);
            if (index !== -1) {
                const envelope = ws.messageQueue.splice(index, 1)[0];
                return resolve(envelope.event.payload);
            }
        }

        // 2. Otherwise set up a listener
        let listener;
        const timeout = setTimeout(() => {
            if (listener) ws.removeListener('message', listener);
            reject(new Error(`Timed out waiting for event: ${eventType}`));
        }, timeoutMs);

        listener = (data) => {
            try {
                const envelope = JSON.parse(data.toString());
                if (envelope.event && envelope.event.type === eventType) {
                    clearTimeout(timeout);
                    ws.removeListener('message', listener);

                    if (ws.messageQueue) {
                        const qIdx = ws.messageQueue.findIndex(m => m.id === envelope.id);
                        if (qIdx !== -1) ws.messageQueue.splice(qIdx, 1);
                    }

                    resolve(envelope.event.payload);
                }
            } catch (err) {
            }
        };

        ws.on('message', listener);
    });
}

/**
 * Asserts that an event is NOT received within a timeout
 * @param {WebSocket} ws 
 * @param {string} eventType 
 * @param {number} waitMs 
 */
function ensureEventNotReceived(ws, eventType, waitMs = 500) {
    return new Promise((resolve, reject) => {
        if (ws.messageQueue) {
            const found = ws.messageQueue.find(m => m.event && m.event.type === eventType);
            if (found) {
                return reject(new Error(`Received forbidden event (from queue): ${eventType}`));
            }
        }

        let listener;
        const timeout = setTimeout(() => {
            if (listener) ws.removeListener('message', listener);
            resolve(true); // Success: didn't get event
        }, waitMs);

        listener = (data) => {
            try {
                const envelope = JSON.parse(data.toString());
                if (envelope.event && envelope.event.type === eventType) {
                    clearTimeout(timeout);
                    ws.removeListener('message', listener);
                    reject(new Error(`Received forbidden event: ${eventType}`));
                }
            } catch (err) {
            }
        };

        ws.on('message', listener);
    });
}

module.exports = {
    createAuthenticatedClient,
    sendEvent,
    waitForEvent,
    ensureEventNotReceived
};
