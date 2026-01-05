import { Event } from '../decorators';
import { EventType } from '../types';
import { WsSender } from '../sender';
import { WebSocket } from 'ws';

export class DebugService {
    constructor(private wsSender: WsSender) {}

    /**
     * Handles the DEBUG_PING event and responds with DEBUG_PONG.
     */
    @Event(EventType.DEBUG_PING)
    handlePing(ws: WebSocket, _payload: unknown) {
        console.log('Received DEBUG_PING, responding with DEBUG_PONG');
        this.wsSender.sendPongEvent(ws, {
            timestamp: Date.now(),
            message: 'Pong from server',
        });
    }
}
