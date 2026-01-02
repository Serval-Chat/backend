import { injectable } from 'inversify';
import {
    IFriendshipRepository,
    IFriendship,
    IFriendRequest,
} from '@/di/interfaces/IFriendshipRepository';
import {
    Friendship,
    FriendRequest,
    areFriends as areFriendsHelper,
} from '@/models/Friendship';
import { User } from '@/models/User';

// Mongoose Friendship repository
//
// Implements IFriendshipRepository using Mongoose Friendship models
@injectable()
export class MongooseFriendshipRepository implements IFriendshipRepository {
    async areFriends(user1: string, user2: string): Promise<boolean> {
        return await areFriendsHelper(user1, user2);
    }

    async findByUserId(userId: string): Promise<IFriendship[]> {
        return await Friendship.find({
            $or: [{ userId }, { friendId: userId }],
        }).lean();
    }

    // Create a new friendship
    //
    // Populates legacy 'user' and 'friend' fields (usernames) to satisfy
    // Unique indexes and maintain backward compatibility    */
    async create(userId: string, friendId: string): Promise<IFriendship> {
        // Fetch usernames for legacy field support
        const [userDoc, friendDoc] = await Promise.all([
            User.findById(userId).select('username').lean(),
            User.findById(friendId).select('username').lean(),
        ]);

        const friendship = new Friendship({
            userId,
            friendId,
            // Populate legacy fields to satisfy unique index
            user: userDoc?.username,
            friend: friendDoc?.username,
        });
        return await friendship.save();
    }

    async remove(userId: string, friendId: string): Promise<boolean> {
        const result = await Friendship.deleteMany({
            $or: [
                { userId, friendId },
                { userId: friendId, friendId: userId },
            ],
        });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }

    async acceptRequest(requestId: string): Promise<IFriendRequest | null> {
        return await FriendRequest.findByIdAndUpdate(
            requestId,
            { status: 'accepted' },
            { new: true },
        ).lean();
    }

    async rejectRequest(requestId: string): Promise<boolean> {
        const result = await FriendRequest.deleteOne({ _id: requestId });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }

    async findRequestById(requestId: string): Promise<IFriendRequest | null> {
        return await FriendRequest.findById(requestId).lean();
    }

    async findRequestBetweenUsers(
        fromId: string,
        toId: string,
    ): Promise<IFriendRequest | null> {
        return await FriendRequest.findOne({
            $or: [
                { fromId, toId, status: 'pending' },
                { fromId: toId, toId: fromId, status: 'pending' },
            ],
        }).lean();
    }

    async findPendingRequestsFor(userId: string): Promise<IFriendRequest[]> {
        return await FriendRequest.find({
            toId: userId,
            status: 'pending',
        }).lean();
    }

    async findExistingRequest(
        fromId: string,
        toId: string,
    ): Promise<IFriendRequest | null> {
        return await FriendRequest.findOne({
            $or: [
                { fromId, toId },
                { fromId: toId, toId: fromId },
            ],
        }).lean();
    }

    // Create a new friend request
    //
    // Populates legacy 'from' and 'to' fields (usernames)    */
    async createRequest(fromId: string, toId: string): Promise<IFriendRequest> {
        // Fetch usernames for legacy field support
        const [fromUser, toUser] = await Promise.all([
            User.findById(fromId).select('username').lean(),
            User.findById(toId).select('username').lean(),
        ]);

        const request = new FriendRequest({
            fromId,
            toId,
            status: 'pending',
            // Populate legacy fields
            from: fromUser?.username,
            to: toUser?.username,
        });
        return await request.save();
    }

    async findAllByUserId(userId: string): Promise<IFriendship[]> {
        return await Friendship.find({
            $or: [
                { userId: userId },
                { friendId: userId },
                // Legacy support
                { user: userId },
                { friend: userId },
            ],
        }).lean();
    }

    async deleteAllForUser(userId: string): Promise<{ deletedCount: number }> {
        const result = await Friendship.deleteMany({
            $or: [
                { userId: userId },
                { friendId: userId },
                // Legacy support
                { user: userId },
                { friend: userId },
            ],
        });
        return { deletedCount: result.deletedCount };
    }

    async deleteAllRequestsForUser(
        userId: string,
    ): Promise<{ deletedCount: number }> {
        const result = await FriendRequest.deleteMany({
            $or: [
                { fromId: userId },
                { toId: userId },
                // Legacy support
                { from: userId },
                { to: userId },
            ],
        });
        return { deletedCount: result.deletedCount };
    }
}
