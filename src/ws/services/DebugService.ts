import { Event } from '../decorators';
import { EventType } from '../types';
import { WsServer } from '../server';
import { WebSocket } from 'ws';

export class DebugService {
    constructor(private wsServer: WsServer) {}

    /**
     * Handles the DEBUG_PING event and responds with DEBUG_PONG.
     */
    @Event(EventType.DEBUG_PING)
    handlePing(ws: WebSocket, payload: Buffer) {
        console.log('Received DEBUG_PING, responding with DEBUG_PONG');
        this.wsServer.send(ws, EventType.DEBUG_PONG, {
            timestamp: Date.now(),
            message: 'Pong from server',
        });
    }
}
