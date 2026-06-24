import type { QueryFilter } from 'mongoose';
import {
    IUserRepository,
    IUser,
    CreateUserDTO,
} from '@/di/interfaces/IUserRepository';
import { AdminPermissions } from '@/permissions/AdminPermissions';
import { User, IUser as IUserModel } from '@/models/User';
import { Friendship, FriendRequest } from '@/models/Friendship';
import { Ban } from '@/models/Ban';
import { ErrorMessages } from '@/constants/errorMessages';

import { injectable } from 'inversify';

function escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeRegexSearch(input: string): string {
    return escapeRegex(input.trim().slice(0, 64));
}

// Mongoose User repository
//
// Implements IUserRepository using Mongoose User model
@injectable()
export class MongooseUserRepository implements IUserRepository {
    private userModel = User;
    private friendshipModel = Friendship;
    private friendRequestModel = FriendRequest;
    private banModel = Ban;

    public constructor() {}

    private toDomain(doc: unknown): IUser | null {
        if (doc === undefined || doc === null) return null;
        return doc as IUser;
    }

    private toDomainList(docs: unknown[]): IUser[] {
        return docs as IUser[];
    }

    public async findById(id: string): Promise<IUser | null> {
        return this.toDomain(
            await this.userModel
                .findOne({ snowflakeId: id })
                .select('-password')
                .lean(),
        );
    }

    public async findByIds(ids: string[]): Promise<IUser[]> {
        return this.toDomainList(
            await this.userModel
                .find({ snowflakeId: { $in: ids } })
                .select(
                    'username displayName deletedAt anonymizedUsername profilePicture usernameFont usernameGradient usernameGlow customStatus',
                )
                .lean(),
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
                .lean(),
        );
    }

    public async findByUsernamePrefix(
        userIds: string[],
        prefix: string,
        limit: number = 10,
    ): Promise<IUser[]> {
        const safePrefix = normalizeRegexSearch(prefix);
        if (safePrefix === '') return [];

        return this.toDomainList(
            await this.userModel
                .find({
                    snowflakeId: { $in: userIds },
                    username: { $regex: `^${safePrefix}`, $options: 'i' },
                })
                .select(
                    'username displayName deletedAt anonymizedUsername profilePicture usernameFont usernameGradient usernameGlow customStatus',
                )
                .limit(limit)
                .lean(),
        );
    }

    public async create(data: CreateUserDTO): Promise<IUser> {
        const user = new this.userModel(data);
        return this.toDomain(await user.save()) as IUser;
    }

    public async update(
        id: string,
        data: Partial<IUser>,
    ): Promise<IUser | null> {
        return this.toDomain(
            await this.userModel
                .findOneAndUpdate({ snowflakeId: id }, data, { new: true })
                .lean(),
        );
    }

    public async delete(id: string): Promise<boolean> {
        const result = await this.userModel.deleteOne({ snowflakeId: id });
        return result.deletedCount > 0;
    }

    // Soft delete a user
    //
    // Marks the user as deleted, sets a reason, and increments the token version
    // To invalidate all existing sessions
    public async softDelete(id: string, reason: string): Promise<boolean> {
        const user = await this.userModel.findOne({ snowflakeId: id });
        if (!user) return false;

        user.deletedAt = new Date();
        user.deletedReason = reason;
        user.tokenVersion = (user.tokenVersion ?? 0) + 1;
        await user.save();

        return true;
    }

    public async comparePassword(
        id: string,
        candidate: string,
    ): Promise<boolean> {
        const user = await this.userModel
            .findOne({ snowflakeId: id })
            .select('password');
        if (!user) return false;
        return (user as IUserModel).comparePassword(candidate);
    }

    public async updateCustomStatus(
        id: string,
        status: {
            text: string;
            emoji?: string;
            expiresAt: Date | null;
            updatedAt: Date;
        } | null,
    ): Promise<void> {
        await this.userModel.findOneAndUpdate(
            { snowflakeId: id },
            { customStatus: status },
        );
    }

    public async updateProfilePicture(
        id: string,
        filename: string,
    ): Promise<void> {
        await this.userModel.findOneAndUpdate(
            { snowflakeId: id },
            {
                profilePicture: filename,
            },
        );
    }

    public async updateLogin(id: string, newLogin: string): Promise<void> {
        await this.userModel.findOneAndUpdate(
            { snowflakeId: id },
            { login: newLogin },
        );
    }

    public async updatePassword(
        id: string,
        newPassword: string,
    ): Promise<void> {
        const user = await this.userModel.findOne({ snowflakeId: id });
        if (!user) throw new Error(ErrorMessages.AUTH.USER_NOT_FOUND);
        (user as IUserModel).password = newPassword;
        await user.save();
    }

    public async updateUsernameStyle(
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
        await this.userModel.findOneAndUpdate({ snowflakeId: id }, style);
    }

    // Update a user's username
    //
    // Cascades the change to related collections (Friendships, FriendRequests)
    // To maintain data consistency for legacy fields
    public async updateUsername(
        id: string,
        newUsername: string,
    ): Promise<void> {
        const user = await this.userModel.findOne({ snowflakeId: id });
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

    public async updateLanguage(id: string, language: string): Promise<void> {
        await this.userModel.findOneAndUpdate(
            { snowflakeId: id },
            { language },
        );
    }

    public async updateBio(id: string, bio: string | null): Promise<void> {
        await this.userModel.findOneAndUpdate({ snowflakeId: id }, { bio });
    }

    public async updatePronouns(
        id: string,
        pronouns: string | null,
    ): Promise<void> {
        await this.userModel.findOneAndUpdate(
            { snowflakeId: id },
            { pronouns },
        );
    }

    public async updateDisplayName(
        id: string,
        displayName: string | null,
    ): Promise<void> {
        await this.userModel.findOneAndUpdate(
            { snowflakeId: id },
            { displayName },
        );
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
        const query: QueryFilter<IUserModel> = {};

        if (includeDeleted !== true) {
            query.deleted = { $ne: true };
        }

        if (search !== undefined && search !== '') {
            const safeSearch = normalizeRegexSearch(search);
            if (safeSearch !== '') {
                query.username = { $regex: safeSearch, $options: 'i' };
            }
        }

        if (filter === 'banned') {
            const activeBans = await this.banModel
                .find({ active: true })
                .select('userId');
            query.snowflakeId = { $in: activeBans.map((b) => b.userId) };
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
                .lean(),
        );
    }

    public async hardDelete(id: string): Promise<boolean> {
        const result = await this.userModel.findOneAndDelete({
            snowflakeId: id,
        });
        return !!result;
    }

    public async updatePermissions(
        id: string,
        permissions: AdminPermissions,
    ): Promise<void> {
        await this.userModel.findOneAndUpdate(
            { snowflakeId: id },
            { permissions },
        );
    }

    public async incrementTokenVersion(id: string): Promise<void> {
        await this.userModel.findOneAndUpdate(
            { snowflakeId: id },
            {
                $inc: { tokenVersion: 1 },
            },
        );
    }

    public async removeBadgeFromAllUsers(badgeId: string): Promise<void> {
        await this.userModel.updateMany(
            { badges: badgeId },
            { $pull: { badges: badgeId } },
        );
    }

    public async updateSettings(
        id: string,
        settings: {
            muteNotifications?: boolean;
            useDiscordStyleMessages?: boolean;
            ownMessagesAlign?: 'left' | 'right';
            otherMessagesAlign?: 'left' | 'right';
            showYouLabel?: boolean;
            ownMessageColor?: string;
            otherMessageColor?: string;
            disableCustomUsernameFonts?: boolean;
            disableCustomUsernameColors?: boolean;
            disableCustomUsernameGlow?: boolean;
            limitedAnimations?: boolean;
            customFontUrl?: string;
            customFontFamily?: string;
            notificationSounds?: {
                id: string;
                name: string;
                url: string;
                enabled: boolean;
            }[];
            useDefaultSounds?: boolean;
            use24HourTime?: boolean;
            keybinds?: Record<
                string,
                {
                    code: string;
                    ctrl?: boolean;
                    alt?: boolean;
                    shift?: boolean;
                    meta?: boolean;
                } | null
            >;
        },
    ): Promise<void> {
        const update: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(settings)) {
            update[`settings.${key}`] = value;
        }

        await this.userModel.findOneAndUpdate(
            { snowflakeId: id },
            {
                $set: update,
            },
        );
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
        id: string,
        filename: string | null,
    ): Promise<void> {
        await this.userModel.findOneAndUpdate(
            { snowflakeId: id },
            { banner: filename },
        );
    }

    public async isBanned(userId: string): Promise<boolean> {
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
