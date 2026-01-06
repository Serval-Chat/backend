import { injectable } from 'inversify';
import { WsController, Event, NeedAuth, Dedup } from '@/ws/decorators';
import type { IWsPingMessageEvent, IWsPingResponseEvent } from '@/ws/protocol/events/ping';

/**
 * Controller for handling ping/pong events.
 */
@injectable()
@WsController()
export class PingController {
    /**
     * Handles the 'ping' event and returns a 'pong' event.
     */
    @Event('ping')
    @NeedAuth()
    @Dedup()
    public async onPing(_payload: IWsPingMessageEvent['payload']): Promise<IWsPingResponseEvent['payload']> {
        return {};
    }
}
