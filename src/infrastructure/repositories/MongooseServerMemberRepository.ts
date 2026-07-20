import {
    IServerMemberRepository,
    IServerMember,
} from '@/di/interfaces/IServerMemberRepository';
import { mapUser, type MappedUser } from '@/utils/user';
import { ErrorMessages } from '@/constants/errorMessages';
import { ServerMember } from '@/models/Server';
import { User } from '@/models/User';
import { injectable } from 'inversify';

function escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeRegexSearch(input: string): string {
    return escapeRegex(input.trim().slice(0, 64));
}

// Mongoose Server Member repository
//
// Implements IServerMemberRepository using Mongoose ServerMember model
@injectable()
export class MongooseServerMemberRepository implements IServerMemberRepository {
    private serverMemberModel = ServerMember;
    private userModel = User;
    public constructor() {}

    public async findByServerAndUser(
        serverId: string,
        userId: string,
    ): Promise<IServerMember | null> {
        return await this.serverMemberModel
            .findOne({ serverId, userId })
            .lean();
    }

    public async findByServerId(serverId: string): Promise<IServerMember[]> {
        return await this.serverMemberModel.find({ serverId }).lean();
    }

    public async create(data: {
        serverId: string;
        userId: string;
        roles: string[];
        onboardingRequired?: boolean;
    }): Promise<IServerMember> {
        const member = new this.serverMemberModel(data);
        return (await member.save()).toObject();
    }

    public async updateRoles(
        serverId: string,
        userId: string,
        roles: string[],
    ): Promise<IServerMember | null> {
        return await this.serverMemberModel
            .findOneAndUpdate(
                { serverId, userId },
                { roles },
                { returnDocument: 'after' },
            )
            .lean();
    }

    public async update(
        serverId: string,
        userId: string,
        data: Partial<IServerMember>,
    ): Promise<IServerMember | null> {
        return await this.serverMemberModel
            .findOneAndUpdate({ serverId, userId }, data, {
                returnDocument: 'after',
            })
            .lean();
    }

    public async setTimeout(
        serverId: string,
        userId: string,
        until: Date | null,
    ): Promise<IServerMember | null> {
        return await this.serverMemberModel
            .findOneAndUpdate(
                { serverId, userId },
                { communicationDisabledUntil: until },
                { returnDocument: 'after' },
            )
            .lean();
    }

    // Remove a member from a server
    //
    // Operation for leaving or kicking a member
    public async remove(serverId: string, userId: string): Promise<boolean> {
        const result = await this.serverMemberModel.deleteOne({
            serverId,
            userId,
        });
        return result.deletedCount > 0;
    }

    public async isMember(serverId: string, userId: string): Promise<boolean> {
        const member = await this.serverMemberModel.findOne({
            serverId,
            userId,
        });
        return !!member;
    }

    public async findAllByUserId(userId: string): Promise<IServerMember[]> {
        return await this.serverMemberModel.find({ userId }).lean();
    }

    public async findByUserId(userId: string): Promise<IServerMember[]> {
        return await this.findAllByUserId(userId);
    }

    public async findServerIdsByUserId(userId: string): Promise<string[]> {
        const members = await this.serverMemberModel
            .find({ userId })
            .select('serverId')
            .lean();
        return members.map((m) => m.serverId);
    }

    public async findUserIdsInServerIds(
        serverIds: string[],
    ): Promise<string[]> {
        if (serverIds.length === 0) return [];
        const userIds = await this.serverMemberModel
            .find({ serverId: { $in: serverIds } })
            .distinct('userId');
        return userIds;
    }

    public async countByServerId(serverId: string): Promise<number> {
        return await this.serverMemberModel.countDocuments({ serverId });
    }

    // Delete a member record by its ID
    //
    // Low-level cleanup operation
    public async deleteById(id: string): Promise<boolean> {
        const result = await this.serverMemberModel.deleteOne({
            snowflakeId: id,
        });
        return result.deletedCount > 0;
    }

    public async deleteByServerId(serverId: string): Promise<void> {
        await this.serverMemberModel.deleteMany({ serverId });
    }

    public async removeRoleFromAllMembers(
        serverId: string,
        roleId: string,
    ): Promise<void> {
        await this.serverMemberModel.updateMany(
            { serverId },
            { $pull: { roles: roleId } },
        );
    }

    public async removeRoleFromMember(
        memberId: string,
        roleId: string,
    ): Promise<IServerMember | null> {
        return await this.serverMemberModel
            .findOneAndUpdate(
                { snowflakeId: memberId },
                { $pull: { roles: roleId } },
                { returnDocument: 'after' },
            )
            .lean();
    }

    public async deleteAllForUser(
        userId: string,
    ): Promise<{ deletedCount: number }> {
        const result = await this.serverMemberModel.deleteMany({ userId });
        return { deletedCount: result.deletedCount };
    }

    // Find all members of a server with user info populated
    //
    // Performs manual population by fetching users in a separate query
    public async findByServerIdWithUserInfo(
        serverId: string,
    ): Promise<(IServerMember & { user: MappedUser | null })[]> {
        const members = await this.serverMemberModel.find({ serverId }).lean();
        const userIds = members.map((m) => m.userId);
        const users = await this.userModel
            .find({ snowflakeId: { $in: userIds } })
            .select(
                '-tokenVersion -permissions -password -settings -language -login -deletedReason',
            )
            .lean();

        return members.map((m) => {
            const user = users.find((u) => u.snowflakeId === m.userId);
            if (!user) return { ...m, user: null };

            const safeUser: Record<string, unknown> = { ...user };
            delete safeUser.tokenVersion;
            delete safeUser.permissions;
            delete safeUser.password;
            delete safeUser.settings;
            delete safeUser.language;
            delete safeUser.login;
            delete safeUser.deletedReason;
            return {
                ...m,
                user: mapUser(safeUser),
            };
        });
    }

    public async searchMembers(
        serverId: string,
        query: string,
    ): Promise<(IServerMember & { user: MappedUser | null })[]> {
        const safeQuery = normalizeRegexSearch(query);
        if (safeQuery === '') return [];

        const users = await this.userModel
            .find({
                $or: [
                    { username: { $regex: safeQuery, $options: 'i' } },
                    { displayName: { $regex: safeQuery, $options: 'i' } },
                ],
            })
            .select('snowflakeId')
            .lean();

        const userIds = users.map((u) => u.snowflakeId);
        const members = await this.serverMemberModel
            .find({ serverId, userId: { $in: userIds } })
            .lean();

        const memberUserIds = members.map((m) => m.userId);
        const populatedUsers = await this.userModel
            .find({ snowflakeId: { $in: memberUserIds } })
            .select(
                '-tokenVersion -permissions -password -settings -language -login -deletedReason',
            )
            .lean();

        return members.map((m) => {
            const user = populatedUsers.find((u) => u.snowflakeId === m.userId);
            if (!user) return { ...m, user: null };

            const safeUser: Record<string, unknown> = { ...user };
            delete safeUser.tokenVersion;
            delete safeUser.permissions;
            delete safeUser.password;
            delete safeUser.settings;
            delete safeUser.language;
            delete safeUser.login;
            delete safeUser.deletedReason;
            return {
                ...m,
                user: mapUser(safeUser),
            };
        });
    }

    public async addRole(
        serverId: string,
        userId: string,
        roleId: string,
    ): Promise<IServerMember> {
        const member = await this.serverMemberModel
            .findOneAndUpdate(
                { serverId, userId },
                { $addToSet: { roles: roleId } },
                { returnDocument: 'after' },
            )
            .lean();
        if (!member) throw new Error(ErrorMessages.MEMBER.NOT_FOUND);
        return member;
    }

    public async removeRole(
        serverId: string,
        userId: string,
        roleId: string,
    ): Promise<IServerMember> {
        const member = await this.serverMemberModel
            .findOneAndUpdate(
                { serverId, userId },
                { $pull: { roles: roleId } },
                { returnDocument: 'after' },
            )
            .lean();
        if (!member) throw new Error(ErrorMessages.MEMBER.NOT_FOUND);
        return member;
    }

    public async removeRoleFromAll(
        serverId: string,
        roleId: string,
    ): Promise<void> {
        await this.removeRoleFromAllMembers(serverId, roleId);
    }
}
