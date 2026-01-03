import { Injectable } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import {
    IUserRepository,
    IUser,
    CreateUserDTO,
} from '@/di/interfaces/IUserRepository';
import { AdminPermissions } from '@/routes/api/v1/admin/permissions';
import { User } from '@/models/User';
import { Friendship, FriendRequest } from '@/models/Friendship';
import { Ban } from '@/models/Ban';
import { ErrorMessages } from '@/constants/errorMessages';

import { injectable } from 'inversify';

// Mongoose User repository
//
// Implements IUserRepository using Mongoose User model
@injectable()
@Injectable()
export class MongooseUserRepository implements IUserRepository {
    private userModel = User;
    private friendshipModel = Friendship;
    private friendRequestModel = FriendRequest;
    private banModel = Ban;

    constructor() { }

    async findById(id: string): Promise<IUser | null> {
        return await this.userModel.findById(id).lean();
    }

    async findByIds(ids: (string | Types.ObjectId)[]): Promise<IUser[]> {
        return await this.userModel.find({ _id: { $in: ids } })
            .select(
                'username displayName deletedAt anonymizedUsername profilePicture usernameFont usernameGradient usernameGlow customStatus',
            )
            .lean();
    }

    async findByLogin(login: string): Promise<IUser | null> {
        return await this.userModel.findOne({ login }).lean();
    }

    async findByUsername(username: string): Promise<IUser | null> {
        return await this.userModel.findOne({ username }).lean();
    }

    async findByUsernames(usernames: string[]): Promise<IUser[]> {
        return await this.userModel.find({ username: { $in: usernames } })
            .select('username displayName customStatus')
            .lean();
    }

    async findByUsernamePrefix(
        userIds: (string | Types.ObjectId)[],
        prefix: string,
        limit: number = 10,
    ): Promise<IUser[]> {
        return await this.userModel.find({
            _id: { $in: userIds },
            username: { $regex: `^${prefix}`, $options: 'i' },
        })
            .select(
                'username displayName deletedAt anonymizedUsername profilePicture usernameFont usernameGradient usernameGlow customStatus',
            )
            .limit(limit)
            .lean();
    }

    async create(data: CreateUserDTO): Promise<IUser> {
        const user = new this.userModel(data);
        return await user.save();
    }

    async update(id: string, data: Partial<IUser>): Promise<IUser | null> {
        return await this.userModel.findByIdAndUpdate(id, data, { new: true }).lean();
    }

    async delete(id: string): Promise<boolean> {
        const result = await this.userModel.deleteOne({ _id: id });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }

    // Soft delete a user
    //
    // Marks the user as deleted, sets a reason, and increments the token version
    // To invalidate all existing sessions
    async softDelete(id: string, reason: string): Promise<boolean> {
        const user = await this.userModel.findById(id);
        if (!user) return false;

        user.deletedAt = new Date();
        user.deletedReason = reason;
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();

        return true;
    }

    async comparePassword(id: string, candidate: string): Promise<boolean> {
        const user = await this.userModel.findById(id).select('password');
        if (!user) return false;
        return (user as any).comparePassword(candidate);
    }

    async updateCustomStatus(
        id: string,
        status: {
            text: string;
            emoji?: string;
            expiresAt: Date | null;
            updatedAt: Date;
        } | null,
    ): Promise<void> {
        await this.userModel.findByIdAndUpdate(id, { customStatus: status });
    }

    async updateProfilePicture(id: string, filename: string): Promise<void> {
        await this.userModel.findByIdAndUpdate(id, { profilePicture: filename });
    }

    async updateLogin(id: string, newLogin: string): Promise<void> {
        await this.userModel.findByIdAndUpdate(id, { login: newLogin });
    }

    async updatePassword(id: string, newPassword: string): Promise<void> {
        const user = await this.userModel.findById(id);
        if (!user) throw new Error(ErrorMessages.AUTH.USER_NOT_FOUND);
        (user as any).password = newPassword;
        await user.save();
    }

    async updateUsernameStyle(
        id: string,
        style: {
            usernameFont?: string;
            usernameGradient?: {
                enabled: boolean;
                colors: string[];
                angle: number;
            };
            usernameGlow?: {
                enabled: boolean;
                color: string;
                intensity: number;
            };
        },
    ): Promise<void> {
        await this.userModel.findByIdAndUpdate(id, style);
    }

    // Update a user's username
    //
    // Cascades the change to related collections (Friendships, FriendRequests)
    // To maintain data consistency for legacy fields
    async updateUsername(id: string, newUsername: string): Promise<void> {
        const user = await this.userModel.findById(id);
        if (!user) throw new Error(ErrorMessages.AUTH.USER_NOT_FOUND);

        const oldUsername = user.username;
        user.username = newUsername;
        await user.save();

        // Update related collections
        await this.friendshipModel.updateMany(
            { user: oldUsername },
            { $set: { user: newUsername } },
        );
        await this.friendshipModel.updateMany(
            { friend: oldUsername },
            { $set: { friend: newUsername } },
        );
        await this.friendRequestModel.updateMany(
            { from: oldUsername },
            { $set: { from: newUsername } },
        );
        await this.friendRequestModel.updateMany(
            { to: oldUsername },
            { $set: { to: newUsername } },
        );
    }

    async updateLanguage(id: string, language: string): Promise<void> {
        await this.userModel.findByIdAndUpdate(id, { language });
    }

    async updateBio(id: string, bio: string | null): Promise<void> {
        await this.userModel.findByIdAndUpdate(id, { bio });
    }

    async updatePronouns(id: string, pronouns: string | null): Promise<void> {
        await this.userModel.findByIdAndUpdate(id, { pronouns });
    }

    async updateDisplayName(
        id: string,
        displayName: string | null,
    ): Promise<void> {
        await this.userModel.findByIdAndUpdate(id, { displayName });
    }

    async findMany(options: {
        limit?: number;
        offset?: number;
        search?: string;
        filter?: 'banned' | 'admin' | 'recent';
        includeDeleted?: boolean;
    }): Promise<IUser[]> {
        const {
            limit = 50,
            offset = 0,
            search,
            filter,
            includeDeleted,
        } = options;
        const query: any = {};

        if (!includeDeleted) {
            query.deleted = { $ne: true };
        }

        if (search) {
            query.username = { $regex: search, $options: 'i' };
        }

        if (filter === 'banned') {
            const activeBans = await this.banModel.find({ active: true }).select(
                'userId',
            );
            query._id = { $in: activeBans.map((b) => b.userId) };
        } else if (filter === 'admin') {
            query['permissions.adminAccess'] = true;
        } else if (filter === 'recent') {
            query.createdAt = {
                $gt: new Date(Date.now() - 24 * 60 * 60 * 1000),
            };
        }

        return await this.userModel.find(query)
            .limit(Number(limit))
            .skip(Number(offset))
            .select('-password')
            .lean();
    }

    async hardDelete(id: string): Promise<boolean> {
        const result = await this.userModel.findByIdAndDelete(id);
        return !!result;
    }

    async updatePermissions(
        id: string,
        permissions: AdminPermissions,
    ): Promise<void> {
        await this.userModel.findByIdAndUpdate(id, { permissions });
    }

    async incrementTokenVersion(id: string): Promise<void> {
        await this.userModel.findByIdAndUpdate(id, { $inc: { tokenVersion: 1 } });
    }

    async removeBadgeFromAllUsers(badgeId: string): Promise<void> {
        await this.userModel.updateMany(
            { badges: badgeId },
            { $pull: { badges: badgeId } },
        );
    }

    async updateSettings(
        id: string,
        settings: {
            muteNotifications?: boolean;
            useDiscordStyleMessages?: boolean;
            ownMessagesAlign?: 'left' | 'right';
            otherMessagesAlign?: 'left' | 'right';
            showYouLabel?: boolean;
            ownMessageColor?: string;
            otherMessageColor?: string;
        },
    ): Promise<void> {
        await this.userModel.findByIdAndUpdate(id, {
            $set: { settings },
        });
    }

    async count(): Promise<number> {
        return await this.userModel.countDocuments();
    }

    async countCreatedAfter(date: Date): Promise<number> {
        return await this.userModel.countDocuments({ createdAt: { $gt: date } });
    }

    async updateBanner(id: string, filename: string | null): Promise<void> {
        await this.userModel.findByIdAndUpdate(id, { banner: filename });
    }
}
