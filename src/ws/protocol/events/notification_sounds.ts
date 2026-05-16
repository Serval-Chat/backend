import type { WsEvent } from '@/ws/protocol/event';

/**
 * Server → Client (Broadcast to user)
 * User's notification sounds have been updated (sync across clients).
 */
export interface INotificationSoundsUpdatedEvent
    extends WsEvent<
        'notification_sounds_updated',
        {
            sounds: {
                id: string;
                name: string;
                url: string;
                enabled: boolean;
            }[];
        }
    > {}
