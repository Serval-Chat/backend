import type { Types } from 'mongoose';

/**
 * Friendship interface (domain model).
 *
 * Represents a friendship between two users.
 */
export interface IFriendship {
    _id: any;
    /** @deprecated Use userId instead */
    user?: string;
    /** @deprecated Use friendId instead */
    friend?: string;
    userId: Types.ObjectId | string;
    friendId: Types.ObjectId | string;
    createdAt?: Date;
}

/**
 * Friend Request interface (domain model).
 *
 * Represents a friend request between two users.
 */
export interface IFriendRequest {
    _id: any;
    /** @deprecated Use fromId instead */
    from?: string;
    /** @deprecated Use toId instead */
    to?: string;
    fromId: Types.ObjectId | string;
    toId: Types.ObjectId | string;
    status: 'pending' | 'accepted' | 'rejected';
    createdAt?: Date;
}

/**
 * Friendship Repository Interface
 *
 * Encapsulates friendship and friend request operations
 */
export interface IFriendshipRepository {
    /**
     * Check if two users are friends
     */
    areFriends(user1: string, user2: string): Promise<boolean>;

    /**
     * Get all friendships for a user
     */
    findByUserId(userId: string): Promise<IFriendship[]>;

    /**
     * Create a new friendship
     */
    create(userId: string, friendId: string): Promise<IFriendship>;

    /**
     * Remove friendship
     */
    remove(userId: string, friendId: string): Promise<boolean>;

    /**
     * Create friend request
     */
    createRequest(fromId: string, toId: string): Promise<IFriendRequest>;

    /**
     * Accept friend request
     */
    acceptRequest(requestId: string): Promise<IFriendRequest | null>;

    /**
     * Reject friend request
     */
    rejectRequest(requestId: string): Promise<boolean>;

    /**
     * Find friend request by ID
     */
    findRequestById(requestId: string): Promise<IFriendRequest | null>;

    /**
     * Find existing friend request between two users (pending only)
     */
    findRequestBetweenUsers(
        fromId: string,
        toId: string,
    ): Promise<IFriendRequest | null>;

    /**
     * Find any existing friend request between two users (any status)
     */
    findExistingRequest(
        fromId: string,
        toId: string,
    ): Promise<IFriendRequest | null>;

    /**
     * Get pending requests for a user.
     */
    findPendingRequestsFor(userId: string): Promise<IFriendRequest[]>;

    /**
     * Find friendships by user ID.
     */
    findAllByUserId(userId: string): Promise<IFriendship[]>;

    /**
     * Delete all friendships for a user (for hard delete)
     */
    deleteAllForUser(userId: string): Promise<{ deletedCount: number }>;

    /**
     * Delete all friend requests for a user (for hard delete)
     */
    deleteAllRequestsForUser(userId: string): Promise<{ deletedCount: number }>;
}
