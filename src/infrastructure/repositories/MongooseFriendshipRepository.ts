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

    async areFriends(user1: string, user2: string): Promise<boolean> {
        if (!user1 || !user2) return false;

        // Do not allow users to message themselves
        if (user1 === user2) return false;

        const conditions: Record<string, unknown>[] = [];
        const user1IsObjectId = Types.ObjectId.isValid(user1);
        const user2IsObjectId = Types.ObjectId.isValid(user2);

        if (user1IsObjectId && user2IsObjectId) {
            const user1Id = new Types.ObjectId(user1);
            const user2Id = new Types.ObjectId(user2);
            conditions.push({ userId: user1Id, friendId: user2Id });
            conditions.push({ userId: user2Id, friendId: user1Id });
        }

        // Fallback for legacy documents that still rely on usernames
        if (!user1IsObjectId && !user2IsObjectId) {
            conditions.push({ user: user1, friend: user2 });
            conditions.push({ user: user2, friend: user1 });
        }

        if (conditions.length === 0) return false;

        const friendship = await this.friendshipModel.findOne({
            $or: conditions,
        });
        return !!friendship;
    }

    async findByUserId(userId: string): Promise<IFriendship[]> {
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
    async create(userId: string, friendId: string): Promise<IFriendship> {
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

    async remove(userId: string, friendId: string): Promise<boolean> {
        const result = await this.friendshipModel.deleteMany({
            $or: [
                { userId, friendId },
                { userId: friendId, friendId: userId },
            ],
        });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }

    async acceptRequest(requestId: string): Promise<IFriendRequest | null> {
        return await this.friendRequestModel
            .findByIdAndUpdate(requestId, { status: 'accepted' }, { new: true })
            .lean();
    }

    async rejectRequest(requestId: string): Promise<boolean> {
        const result = await this.friendRequestModel.deleteOne({
            _id: requestId,
        });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }

    async findRequestById(requestId: string): Promise<IFriendRequest | null> {
        return await this.friendRequestModel.findById(requestId).lean();
    }

    async findRequestBetweenUsers(
        fromId: string,
        toId: string,
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

    async findPendingRequestsFor(userId: string): Promise<IFriendRequest[]> {
        return await this.friendRequestModel
            .find({
                toId: userId,
                status: 'pending',
            })
            .lean();
    }

    async findExistingRequest(
        fromId: string,
        toId: string,
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
    async createRequest(fromId: string, toId: string): Promise<IFriendRequest> {
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

    async findAllByUserId(userId: string): Promise<IFriendship[]> {
        return await this.friendshipModel
            .find({
                $or: [
                    { userId: userId },
                    { friendId: userId },
                    // Legacy support
                    { user: userId },
                    { friend: userId },
                ],
            })
            .lean();
    }

    async deleteAllForUser(userId: string): Promise<{ deletedCount: number }> {
        const result = await this.friendshipModel.deleteMany({
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
        const result = await this.friendRequestModel.deleteMany({
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
