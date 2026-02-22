import type { Types, ClientSession } from 'mongoose';

// DM Unread interface
//
// Tracks the number of unread direct messages for a user from a specific peer
export interface IDmUnread {
    // The recipient of the messages (the user who has unreads)
    user: Types.ObjectId;
    // The sender of the messages (the peer who sent them)
    peer: Types.ObjectId;
    count: number;
    createdAt?: Date;
    updatedAt?: Date;
}

// DM Unread Repository Interface
//
// Manages unread message counters for direct messages
export interface IDmUnreadRepository {
    // Find all unread counters for a specific user
    findByUser(userId: Types.ObjectId): Promise<IDmUnread[]>;

    // Find the unread counter for a specific user-peer pair
    findByUserAndPeer(
        userId: Types.ObjectId,
        peerId: Types.ObjectId,
    ): Promise<IDmUnread | null>;

    // Increment the unread count for a user from a peer
    // Returns the new count after increment
    increment(
        userId: Types.ObjectId,
        peerId: Types.ObjectId,
        session?: ClientSession,
    ): Promise<number>;

    // Reset the unread count for a user from a peer to zero
    reset(userId: Types.ObjectId, peerId: Types.ObjectId): Promise<void>;
}
