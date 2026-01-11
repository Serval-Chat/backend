import type { WsEvent } from '@/ws/protocol/event';
import type { FriendResponseDTO } from '@/controllers/dto/friendship.response.dto';

/**
 * Server → Client (Unicast)
 * Received an incoming friend request.
 */
export interface IIncomingRequestAddedEvent
    extends WsEvent<
        'incoming_request_added',
        {
            _id: string;
            from: string;
            fromId: string;
            createdAt: string;
        }
    > {}

/**
 * Server → Client (Unicast)
 * Friend request removed (accepted/rejected/cancelled).
 */
export interface IIncomingRequestRemovedEvent
    extends WsEvent<
        'incoming_request_removed',
        {
            from: string;
            fromId: string;
        }
    > {}

/**
 * Server → Client (Unicast)
 * New friend added (request accepted).
 */
export interface IFriendAddedEvent
    extends WsEvent<
        'friend_added',
        {
            friend: FriendResponseDTO;
        }
    > {}

/**
 * Server → Client (Unicast)
 * Friend removed.
 */
export interface IFriendRemovedEvent
    extends WsEvent<
        'friend_removed',
        {
            username: string;
            userId: string;
        }
    > {}
