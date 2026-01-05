import type { SerializedCustomStatus } from '@/utils/status';

export interface FriendResponseDTO {
    _id: string;
    username: string;
    displayName?: string;
    createdAt: string | Date;
    profilePicture: string | null;
    customStatus: SerializedCustomStatus | null;
    latestMessageAt?: string | null;
}

export interface IncomingFriendRequestResponseDTO {
    _id: string;
    from?: string;
    fromId?: string;
    createdAt: Date;
}

export interface SendFriendRequestResponseDTO {
    message: string;
    request: unknown;
}

export interface AcceptFriendRequestResponseDTO {
    message: string;
    friend: FriendResponseDTO | null;
}

export interface FriendshipMessageResponseDTO {
    message: string;
}
