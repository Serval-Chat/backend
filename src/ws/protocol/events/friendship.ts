import type { WsEvent } from '@/ws/protocol/event';
import type { FriendResponseDTO } from '@/controllers/dto/friendship.response.dto';

/**
 * Server -> Client (Unicast)
 * Received an incoming friend request.
 */
export interface IIncomingRequestAddedEvent
    extends WsEvent<
        'incoming_request_added',
        {
            id: string;
            from: string;
            fromId: string;
            createdAt: string;
        }
    > {}

/**
 * Server -> Client (Unicast)
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
 * Server -> Client (Unicast)
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
 * Server -> Client (Unicast)
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

/**
 * Server -> Client (Unicast)
 * DM pin state changed for a friend (private to the pinning user).
 */
export interface IFriendPinUpdatedEvent
    extends WsEvent<
        'friend_pin_updated',
        {
            friendId: string;
            isPinned: boolean;
        }
    > {}

/**
 * Server -> Client (Unicast)
 * Local nickname for a friend changed (private to the owning user).
 */
export interface IFriendNicknameUpdatedEvent
    extends WsEvent<
        'friend_nickname_updated',
        {
            friendId: string;
            nickname: string | null;
        }
    > {}
