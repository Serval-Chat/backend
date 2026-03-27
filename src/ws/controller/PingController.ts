import { injectable, inject } from 'inversify';
import { WsController, Event, NeedAuth, Dedup } from '@/ws/decorators';
import type { WebSocket } from 'ws';
import type {
    IWsPingMessageEvent,
    IWsPingResponseEvent,
} from '@/ws/protocol/events/ping';
import { TYPES } from '@/di/types';
import type { IWsServer } from '@/ws/interfaces/IWsServer';

/**
 * Controller for handling ping/pong events.
 * The ping handler also refreshes the client's presence TTL so a short TTL
 * (90s) does not expire connections that are genuinely active.
 */
@injectable()
@WsController()
export class PingController {
    constructor(
        @inject(TYPES.WsServer) private wsServer: IWsServer,
    ) {}

    /**
     * Handles the 'ping' event and returns a 'pong' event.
     * Refreshes presence TTL as a heartbeat side-effect.
     */
    @Event('ping')
    @NeedAuth()
    @Dedup()
    public async onPing(
        _payload: IWsPingMessageEvent['payload'],
        _user: unknown,
        ws: WebSocket,
    ): Promise<IWsPingResponseEvent['payload']> {
        await this.wsServer.refreshPresence(ws);
        return {};
    }
}
