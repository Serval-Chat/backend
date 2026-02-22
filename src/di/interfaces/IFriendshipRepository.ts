import type { Types } from 'mongoose';

// Friendship interface (domain model)
//
// Represents a friendship between two users
export interface IFriendship {
    _id: Types.ObjectId;
    /** @deprecated Use userId instead */
    user?: string;
    /** @deprecated Use friendId instead */
    friend?: string;
    userId: Types.ObjectId;
    friendId: Types.ObjectId;
    createdAt?: Date;
}

// Friend Request interface (domain model)
//
// Represents a friend request between two users
export interface IFriendRequest {
    _id: Types.ObjectId;
    /** @deprecated Use fromId instead */
    from?: string;
    /** @deprecated Use toId instead */
    to?: string;
    fromId: Types.ObjectId;
    toId: Types.ObjectId;
    status: 'pending' | 'accepted' | 'rejected';
    createdAt?: Date;
}

// Friendship Repository Interface
//
// Encapsulates friendship and friend request operations
export interface IFriendshipRepository {
    // Check if two users are friends
    areFriends(user1: Types.ObjectId, user2: Types.ObjectId): Promise<boolean>;

    // Get all friendships for a user
    findByUserId(userId: Types.ObjectId): Promise<IFriendship[]>;

    // Create a new friendship
    create(userId: Types.ObjectId, friendId: Types.ObjectId): Promise<IFriendship>;

    // Remove friendship
    remove(userId: Types.ObjectId, friendId: Types.ObjectId): Promise<boolean>;

    // Create friend request
    createRequest(
        fromId: Types.ObjectId,
        toId: Types.ObjectId,
    ): Promise<IFriendRequest>;

    // Accept friend request
    acceptRequest(requestId: Types.ObjectId): Promise<IFriendRequest | null>;

    // Reject friend request
    rejectRequest(requestId: Types.ObjectId): Promise<boolean>;

    // Find friend request by ID
    findRequestById(requestId: Types.ObjectId): Promise<IFriendRequest | null>;

    // Find existing friend request between two users (pending only)
    findRequestBetweenUsers(
        fromId: Types.ObjectId,
        toId: Types.ObjectId,
    ): Promise<IFriendRequest | null>;

    // Find any existing friend request between two users (any status)
    findExistingRequest(
        fromId: Types.ObjectId,
        toId: Types.ObjectId,
    ): Promise<IFriendRequest | null>;

    // Get pending requests for a user
    findPendingRequestsFor(userId: Types.ObjectId): Promise<IFriendRequest[]>;

    // Find friendships by user ID
    findAllByUserId(userId: Types.ObjectId): Promise<IFriendship[]>;

    // Delete all friendships for a user (for hard delete)
    deleteAllForUser(userId: Types.ObjectId): Promise<{ deletedCount: number }>;

    // Delete all friend requests for a user (for hard delete)
    deleteAllRequestsForUser(
        userId: Types.ObjectId,
    ): Promise<{ deletedCount: number }>;
}
