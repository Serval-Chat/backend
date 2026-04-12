import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import {
    IFriendshipRepository,
    IFriendship,
    IFriendRequest,
} from '@/di/interfaces/IFriendshipRepository';

import { Friendship, FriendRequest } from '@/models/Friendship';
import { User } from '@/models/User';
import { injectable } from 'inversify';

// Mongoose Friendship repository
//
// Implements IFriendshipRepository using Mongoose Friendship models
@injectable()
@Injectable()
export class MongooseFriendshipRepository implements IFriendshipRepository {
    private friendshipModel = Friendship;
    private friendRequestModel = FriendRequest;
    private userModel = User;
    constructor() {}

    async areFriends(
        user1: Types.ObjectId,
        user2: Types.ObjectId,
    ): Promise<boolean> {
        if (!user1 || !user2) return false;

        // Do not allow users to message themselves
        if (user1.equals(user2)) return false;

        const friendship = await this.friendshipModel.findOne({
            $or: [
                { userId: user1, friendId: user2 },
                { userId: user2, friendId: user1 },
            ],
        });
        return !!friendship;
    }

    async findByUserId(userId: Types.ObjectId): Promise<IFriendship[]> {
        return await this.friendshipModel
            .find({
                $or: [{ userId }, { friendId: userId }],
            })
            .lean();
    }

    // Create a new friendship
    //
    // Populates legacy 'user' and 'friend' fields (usernames) to satisfy
    // Unique indexes and maintain backward compatibility    */
    async create(
        userId: Types.ObjectId,
        friendId: Types.ObjectId,
    ): Promise<IFriendship> {
        // Fetch usernames for legacy field support
        const [userDoc, friendDoc] = await Promise.all([
            this.userModel.findById(userId).select('username').lean(),
            this.userModel.findById(friendId).select('username').lean(),
        ]);

        const friendship = new this.friendshipModel({
            userId,
            friendId,
            // Populate legacy fields to satisfy unique index
            user: userDoc?.username,
            friend: friendDoc?.username,
        });
        return await friendship.save();
    }

    async remove(
        userId: Types.ObjectId,
        friendId: Types.ObjectId,
    ): Promise<boolean> {
        const result = await this.friendshipModel.deleteMany({
            $or: [
                { userId, friendId },
                { userId: friendId, friendId: userId },
            ],
        });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }

    async acceptRequest(
        requestId: Types.ObjectId,
    ): Promise<IFriendRequest | null> {
        return await this.friendRequestModel
            .findByIdAndUpdate(requestId, { status: 'accepted' }, { new: true })
            .lean();
    }

    async rejectRequest(requestId: Types.ObjectId): Promise<boolean> {
        const result = await this.friendRequestModel.deleteOne({
            _id: requestId,
        });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }

    async findRequestById(
        requestId: Types.ObjectId,
    ): Promise<IFriendRequest | null> {
        return await this.friendRequestModel.findById(requestId).lean();
    }

    async findRequestBetweenUsers(
        fromId: Types.ObjectId,
        toId: Types.ObjectId,
    ): Promise<IFriendRequest | null> {
        return await this.friendRequestModel
            .findOne({
                $or: [
                    { fromId, toId, status: 'pending' },
                    { fromId: toId, toId: fromId, status: 'pending' },
                ],
            })
            .lean();
    }

    async findPendingRequestsFor(
        userId: Types.ObjectId,
    ): Promise<IFriendRequest[]> {
        return await this.friendRequestModel
            .find({
                toId: userId,
                status: 'pending',
            })
            .lean();
    }

    async findExistingRequest(
        fromId: Types.ObjectId,
        toId: Types.ObjectId,
    ): Promise<IFriendRequest | null> {
        return await this.friendRequestModel
            .findOne({
                $or: [
                    { fromId, toId },
                    { fromId: toId, toId: fromId },
                ],
            })
            .lean();
    }

    // Create a new friend request
    //
    // Populates legacy 'from' and 'to' fields (usernames)    */
    async createRequest(
        fromId: Types.ObjectId,
        toId: Types.ObjectId,
    ): Promise<IFriendRequest> {
        // Fetch usernames for legacy field support
        const [fromUser, toUser] = await Promise.all([
            this.userModel.findById(fromId).select('username').lean(),
            this.userModel.findById(toId).select('username').lean(),
        ]);

        const request = new this.friendRequestModel({
            fromId,
            toId,
            status: 'pending',
            // Populate legacy fields
            from: fromUser?.username,
            to: toUser?.username,
        });
        return await request.save();
    }

    async findAllByUserId(userId: Types.ObjectId): Promise<IFriendship[]> {
        return await this.friendshipModel
            .find({
                $or: [{ userId: userId }, { friendId: userId }],
            })
            .lean();
    }

    async deleteAllForUser(
        userId: Types.ObjectId,
    ): Promise<{ deletedCount: number }> {
        const result = await this.friendshipModel.deleteMany({
            $or: [{ userId: userId }, { friendId: userId }],
        });
        return { deletedCount: result.deletedCount };
    }

    async deleteAllRequestsForUser(
        userId: Types.ObjectId,
    ): Promise<{ deletedCount: number }> {
        const result = await this.friendRequestModel.deleteMany({
            $or: [{ fromId: userId }, { toId: userId }],
        });
        return { deletedCount: result.deletedCount || 0 };
    }

    async removeRequestBetweenUsers(
        user1: Types.ObjectId,
        user2: Types.ObjectId,
    ): Promise<boolean> {
        const result = await this.friendRequestModel.deleteMany({
            $or: [
                { fromId: user1, toId: user2 },
                { fromId: user2, toId: user1 },
            ],
        });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }
}
