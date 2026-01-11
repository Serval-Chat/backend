import type { WsEvent } from '@/ws/protocol/event';
import type { IMessageServer, IMessageDm } from './messages';

/**
 * Server → Client (Broadcast to targeted user)
 * New notification alert (mention or reaction).
 */
export interface IMentionEvent
    extends WsEvent<
        'mention',
        {
            type: 'mention' | 'reaction';
            senderId: string;
            sender: string; // Username who triggered the notification
            serverId?: string; // Present for server instances
            channelId?: string; // Present for server instances
            message: IMessageServer | IMessageDm;
        }
    > {}
