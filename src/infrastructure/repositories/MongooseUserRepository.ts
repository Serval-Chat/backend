import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import type { FilterQuery } from 'mongoose';
import {
    IUserRepository,
    IUser,
    CreateUserDTO,
} from '@/di/interfaces/IUserRepository';
import { AdminPermissions } from '@/routes/api/v1/admin/permissions';
import { User, IUser as IUserModel } from '@/models/User';
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

    public constructor() { }

    private toDomain(doc: unknown): IUser | null {
        if (doc === undefined || doc === null) return null;
        return doc as IUser;
    }

    private toDomainList(docs: unknown[]): IUser[] {
        return docs as IUser[];
    }

    public async findById(id: Types.ObjectId): Promise<IUser | null> {
        return this.toDomain(await this.userModel.findById(id).select('-password').lean());
    }

    public async findByIds(ids: Types.ObjectId[]): Promise<IUser[]> {
        return this.toDomainList(
            await this.userModel
                .find({ _id: { $in: ids } })
                .select(
                    'username displayName deletedAt anonymizedUsername profilePicture usernameFont usernameGradient usernameGlow customStatus',
                )
                .lean()
        );
    }

    public async findByLogin(login: string): Promise<IUser | null> {
        return this.toDomain(await this.userModel.findOne({ login }).lean());
    }

    public async findByUsername(username: string): Promise<IUser | null> {
        return this.toDomain(await this.userModel.findOne({ username }).lean());
    }

    public async findByUsernames(usernames: string[]): Promise<IUser[]> {
        return this.toDomainList(
            await this.userModel
                .find({ username: { $in: usernames } })
                .select('username displayName customStatus')
                .lean()
        );
    }

    public async findByUsernamePrefix(
        userIds: Types.ObjectId[],
        prefix: string,
        limit: number = 10,
    ): Promise<IUser[]> {
        return this.toDomainList(
            await this.userModel
                .find({
                    _id: { $in: userIds },
                    username: { $regex: `^${prefix}`, $options: 'i' },
                })
                .select(
                    'username displayName deletedAt anonymizedUsername profilePicture usernameFont usernameGradient usernameGlow customStatus',
                )
                .limit(limit)
                .lean()
        );
    }

    public async create(data: CreateUserDTO): Promise<IUser> {
        const user = new this.userModel(data);
        return this.toDomain(await user.save()) as IUser;
    }

    public async update(
        id: Types.ObjectId,
        data: Partial<IUser>,
    ): Promise<IUser | null> {
        return this.toDomain(
            await this.userModel
                .findByIdAndUpdate(id, data, { new: true })
                .lean()
        );
    }

    public async delete(id: Types.ObjectId): Promise<boolean> {
        const result = await this.userModel.deleteOne({ _id: id });
        return result.deletedCount > 0;
    }

    // Soft delete a user
    //
    // Marks the user as deleted, sets a reason, and increments the token version
    // To invalidate all existing sessions
    public async softDelete(id: Types.ObjectId, reason: string): Promise<boolean> {
        const user = await this.userModel.findById(id);
        if (!user) return false;

        user.deletedAt = new Date();
        user.deletedReason = reason;
        user.tokenVersion = (user.tokenVersion ?? 0) + 1;
        await user.save();

        return true;
    }

    public async comparePassword(
        id: Types.ObjectId,
        candidate: string,
    ): Promise<boolean> {
        const user = await this.userModel.findById(id).select('password');
        if (!user) return false;
        return (user as unknown as IUserModel).comparePassword(candidate);
    }

    public async updateCustomStatus(
        id: Types.ObjectId,
        status: {
            text: string;
            emoji?: string;
            expiresAt: Date | null;
            updatedAt: Date;
        } | null,
    ): Promise<void> {
        await this.userModel.findByIdAndUpdate(id, { customStatus: status });
    }

    public async updateProfilePicture(
        id: Types.ObjectId,
        filename: string,
    ): Promise<void> {
        await this.userModel.findByIdAndUpdate(id, {
            profilePicture: filename,
        });
    }

    public async updateLogin(id: Types.ObjectId, newLogin: string): Promise<void> {
        await this.userModel.findByIdAndUpdate(id, { login: newLogin });
    }

    public async updatePassword(
        id: Types.ObjectId,
        newPassword: string,
    ): Promise<void> {
        const user = await this.userModel.findById(id);
        if (!user) throw new Error(ErrorMessages.AUTH.USER_NOT_FOUND);
        (user as unknown as IUserModel).password = newPassword;
        await user.save();
    }

    public async updateUsernameStyle(
        id: Types.ObjectId,
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
    public async updateUsername(
        id: Types.ObjectId,
        newUsername: string,
    ): Promise<void> {
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

    public async updateLanguage(id: Types.ObjectId, language: string): Promise<void> {
        await this.userModel.findByIdAndUpdate(id, { language });
    }

    public async updateBio(id: Types.ObjectId, bio: string | null): Promise<void> {
        await this.userModel.findByIdAndUpdate(id, { bio });
    }

    public async updatePronouns(
        id: Types.ObjectId,
        pronouns: string | null,
    ): Promise<void> {
        await this.userModel.findByIdAndUpdate(id, { pronouns });
    }

    public async updateDisplayName(
        id: Types.ObjectId,
        displayName: string | null,
    ): Promise<void> {
        await this.userModel.findByIdAndUpdate(id, { displayName });
    }

    public async findMany(options: {
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
        const query: FilterQuery<IUserModel> = {};

        if (includeDeleted !== true) {
            query.deleted = { $ne: true };
        }

        if (search !== undefined && search !== '') {
            query.username = { $regex: search, $options: 'i' };
        }

        if (filter === 'banned') {
            const activeBans = await this.banModel
                .find({ active: true })
                .select('userId');
            query._id = { $in: activeBans.map((b) => b.userId) };
        } else if (filter === 'admin') {
            query['permissions.adminAccess'] = true;
        } else if (filter === 'recent') {
            query.createdAt = {
                $gt: new Date(Date.now() - 24 * 60 * 60 * 1000),
            };
        }

        return this.toDomainList(
            await this.userModel
                .find(query)
                .limit(Number(limit))
                .skip(Number(offset))
                .select('-password')
                .lean()
        );
    }

    public async hardDelete(id: Types.ObjectId): Promise<boolean> {
        const result = await this.userModel.findByIdAndDelete(id);
        return !!result;
    }

    public async updatePermissions(
        id: Types.ObjectId,
        permissions: AdminPermissions,
    ): Promise<void> {
        await this.userModel.findByIdAndUpdate(id, { permissions });
    }

    public async incrementTokenVersion(id: Types.ObjectId): Promise<void> {
        await this.userModel.findByIdAndUpdate(id, {
            $inc: { tokenVersion: 1 },
        });
    }

    public async removeBadgeFromAllUsers(badgeId: string): Promise<void> {
        const bid = new Types.ObjectId(badgeId);
        await this.userModel.updateMany(
            { badges: bid },
            { $pull: { badges: bid } },
        );
    }

    public async updateSettings(
        id: Types.ObjectId,
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

    public async count(): Promise<number> {
        return await this.userModel.countDocuments();
    }

    public async countCreatedAfter(date: Date): Promise<number> {
        return await this.userModel.countDocuments({
            createdAt: { $gt: date },
        });
    }

    public async updateBanner(
        id: Types.ObjectId,
        filename: string | null,
    ): Promise<void> {
        await this.userModel.findByIdAndUpdate(id, { banner: filename });
    }

    public async isBanned(userId: Types.ObjectId): Promise<boolean> {
        await this.banModel.checkExpired(userId);
        const activeBan = await this.banModel.findOne({
            userId,
            active: true,
        });
        return !!activeBan;
    }

    public async countByHour(since: Date, hours: number): Promise<number[]> {
        const msPerHour = 1000 * 60 * 60;
        const buckets = await this.userModel.aggregate<{
            _id: number;
            count: number;
        }>([
            { $match: { createdAt: { $gte: since } } },
            {
                $group: {
                    _id: {
                        $floor: {
                            $divide: [
                                { $subtract: ['$createdAt', since] },
                                msPerHour,
                            ],
                        },
                    },
                    count: { $sum: 1 },
                },
            },
        ]);
        const result = Array<number>(hours).fill(0);
        for (const b of buckets) {
            const idx = Math.floor(b._id);
            if (idx >= 0 && idx < hours) result[idx] = b.count;
        }
        return result;
    }

    public async countByDay(since: Date, days: number): Promise<number[]> {
        if (days <= 0 || !Number.isFinite(days) || days > 10000) {
            return [];
        }
        
        const msPerDay = 1000 * 60 * 60 * 24;
        const buckets = await this.userModel.aggregate<{
            _id: number;
            count: number;
        }>([
            { $match: { createdAt: { $gte: since } } },
            {
                $group: {
                    _id: {
                        $floor: {
                            $divide: [
                                { $subtract: ['$createdAt', since] },
                                msPerDay,
                            ],
                        },
                    },
                    count: { $sum: 1 },
                },
            },
        ]);
        const result = Array<number>(days).fill(0);
        for (const b of buckets) {
            const idx = Math.floor(b._id);
            if (idx >= 0 && idx < days) result[idx] = b.count;
        }
        return result;
    }

    public async countAllByDay(): Promise<number[]> {
        const oldestUser = await this.userModel
            .findOne()
            .sort({ createdAt: 1 })
            .lean();
        if (!oldestUser) return [];

        const now = new Date();
        const startOfOldestDay = new Date(oldestUser.createdAt);
        startOfOldestDay.setHours(0, 0, 0, 0);

        const diffTime = Math.abs(now.getTime() - startOfOldestDay.getTime());
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return this.countByDay(startOfOldestDay, days);
    }
}
