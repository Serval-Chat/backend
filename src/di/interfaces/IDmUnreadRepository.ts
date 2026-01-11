import type { Types, ClientSession } from 'mongoose';

// DM Unread interface
//
// Tracks the number of unread direct messages for a user from a specific peer
export interface IDmUnread {
    // The recipient of the messages (the user who has unreads)
    user: Types.ObjectId | string;
    // The sender of the messages (the peer who sent them)
    peer: Types.ObjectId | string;
    count: number;
    createdAt?: Date;
    updatedAt?: Date;
}

// DM Unread Repository Interface
//
// Manages unread message counters for direct messages
export interface IDmUnreadRepository {
    // Find all unread counters for a specific user
    findByUser(userId: string): Promise<IDmUnread[]>;

    // Find the unread counter for a specific user-peer pair
    findByUserAndPeer(
        userId: string,
        peerId: string,
    ): Promise<IDmUnread | null>;

    // Increment the unread count for a user from a peer
    // Returns the new count after increment
    increment(
        userId: string,
        peerId: string,
        session?: ClientSession,
    ): Promise<number>;

    // Reset the unread count for a user from a peer to zero
    reset(userId: string, peerId: string): Promise<void>;
}
