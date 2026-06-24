import { mongooseIdPlugin } from '@/utils/mongooseId';
import { isValidSnowflakeId, snowflakeIdPlugin } from '@/utils/snowflake';
import type { Document, Model } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

// Friendship interface
//
// Represents friendship between two users
// Supports legacy string-based IDs and new ObjectId references
//
// Legacy support due to existing database structure
interface IFriendship extends Document {
    snowflakeId: string;
    user: string; // Keep for backward compatibility
    friend: string; // Keep for backward compatibility
    userId: string;
    friendId: string;
    createdAt: Date;
    isPinned?: boolean; // Whether this user has pinned the DM with friendId
}

// Friend Request interface
//
// Represents a pending, accepted, or rejected friend request
interface IFriendRequest extends Document {
    snowflakeId: string;
    from: string; // Keep for backward compatibility
    to: string; // Keep for backward compatibility
    fromId: string;
    toId: string;
    status: 'pending' | 'accepted' | 'rejected';
    createdAt: Date;
}

const friendshipSchema = new Schema<IFriendship>({
    user: { type: String, required: false }, // Legacy field
    friend: { type: String, required: false }, // Legacy field
    userId: { type: String, required: false },
    friendId: { type: String, required: false },
    createdAt: { type: Date, default: Date.now },
    isPinned: { type: Boolean, default: false },
});
friendshipSchema.plugin(mongooseIdPlugin);
friendshipSchema.plugin(snowflakeIdPlugin);
friendshipSchema.index({ user: 1, friend: 1 }, { unique: true, sparse: true });
friendshipSchema.index(
    { userId: 1, friendId: 1 },
    { unique: true, sparse: true },
);

const friendRequestSchema = new Schema<IFriendRequest>({
    from: { type: String, required: false }, // Legacy field
    to: { type: String, required: false }, // Legacy field
    fromId: { type: String, required: false },
    toId: { type: String, required: false },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected'],
        default: 'pending',
    },
    createdAt: { type: Date, default: Date.now },
});
friendRequestSchema.plugin(mongooseIdPlugin);
friendRequestSchema.plugin(snowflakeIdPlugin);
friendRequestSchema.index({ from: 1, to: 1 }, { unique: true, sparse: true });
friendRequestSchema.index(
    { fromId: 1, toId: 1 },
    { unique: true, sparse: true },
);

// Check if two users are friends
//
// Handles both new ObjectId-based friendships and legacy username-based ones
//
// @param user1 - ID or username of first user
// @param user2 - ID or username of second user
// @param username1 - Optional username of first user
// @param username2 - Optional username of second user
//
// @returns Promise<boolean> - True if users are friends, false otherwise
export const areFriends = async (
    user1: string,
    user2: string,
    username1?: string,
    username2?: string,
): Promise<boolean> => {
    if (user1 === '' || user2 === '') return false;

    // Allow users to message themselves (for saved messages/notes)
    if (user1 === user2) return true;

    const conditions: Record<string, unknown>[] = [];
    const user1IsSnowflakeId = isValidSnowflakeId(user1);
    const user2IsSnowflakeId = isValidSnowflakeId(user2);

    if (user1IsSnowflakeId && user2IsSnowflakeId) {
        conditions.push({ userId: user1, friendId: user2 });
        conditions.push({ userId: user2, friendId: user1 });
    }

    // Fallback for legacy documents that still rely on usernames
    // If usernames are provided, use them. Otherwise, try using user1/user2 if they are NOT ObjectIds
    if (
        username1 !== undefined &&
        username1 !== '' &&
        username2 !== undefined &&
        username2 !== ''
    ) {
        conditions.push({ user: username1, friend: username2 });
        conditions.push({ user: username2, friend: username1 });
    } else if (!user1IsSnowflakeId && !user2IsSnowflakeId) {
        conditions.push({ user: user1, friend: user2 });
        conditions.push({ user: user2, friend: user1 });
    }

    const friendship = await Friendship.findOne({ $or: conditions });
    return !!friendship;
};

export const Friendship: Model<IFriendship> = mongoose.model(
    'Friendship',
    friendshipSchema,
);
export const FriendRequest: Model<IFriendRequest> = mongoose.model(
    'FriendRequest',
    friendRequestSchema,
);
