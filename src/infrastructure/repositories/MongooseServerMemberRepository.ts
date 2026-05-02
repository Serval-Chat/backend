import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import {
    IServerMemberRepository,
    IServerMember,
} from '@/di/interfaces/IServerMemberRepository';
import { mapUser, type MappedUser } from '@/utils/user';
import { ErrorMessages } from '@/constants/errorMessages';
import { ServerMember } from '@/models/Server';
import { User } from '@/models/User';
import { injectable } from 'inversify';

// Mongoose Server Member repository
//
// Implements IServerMemberRepository using Mongoose ServerMember model
@injectable()
@Injectable()
export class MongooseServerMemberRepository implements IServerMemberRepository {
    private serverMemberModel = ServerMember;
    private userModel = User;
    public constructor() {}

    public async findByServerAndUser(
        serverId: Types.ObjectId,
        userId: Types.ObjectId,
    ): Promise<IServerMember | null> {
        return await this.serverMemberModel
            .findOne({ serverId, userId })
            .lean();
    }

    public async findByServerId(serverId: Types.ObjectId): Promise<IServerMember[]> {
        return await this.serverMemberModel.find({ serverId }).lean();
    }

    public async create(data: {
        serverId: Types.ObjectId;
        userId: Types.ObjectId;
        roles: Types.ObjectId[];
    }): Promise<IServerMember> {
        const member = new this.serverMemberModel(data);
        return (await member.save()).toObject();
    }

    public async updateRoles(
        serverId: Types.ObjectId,
        userId: Types.ObjectId,
        roles: Types.ObjectId[],
    ): Promise<IServerMember | null> {
        return await this.serverMemberModel
            .findOneAndUpdate({ serverId, userId }, { roles }, { new: true })
            .lean();
    }

    public async setTimeout(
        serverId: Types.ObjectId,
        userId: Types.ObjectId,
        until: Date | null,
    ): Promise<IServerMember | null> {
        return await this.serverMemberModel
            .findOneAndUpdate(
                { serverId, userId },
                { communicationDisabledUntil: until },
                { new: true },
            )
            .lean();
    }

    // Remove a member from a server
    //
    // Operation for leaving or kicking a member
    public async remove(
        serverId: Types.ObjectId,
        userId: Types.ObjectId,
    ): Promise<boolean> {
        const result = await this.serverMemberModel.deleteOne({
            serverId,
            userId,
        });
        return result.deletedCount > 0;
    }

    public async isMember(
        serverId: Types.ObjectId,
        userId: Types.ObjectId,
    ): Promise<boolean> {
        const member = await this.serverMemberModel.findOne({
            serverId,
            userId,
        });
        return !!member;
    }

    public async findAllByUserId(userId: Types.ObjectId): Promise<IServerMember[]> {
        return await this.serverMemberModel.find({ userId }).lean();
    }

    public async findByUserId(userId: Types.ObjectId): Promise<IServerMember[]> {
        return await this.findAllByUserId(userId);
    }

    public async findServerIdsByUserId(
        userId: Types.ObjectId,
    ): Promise<Types.ObjectId[]> {
        const members = await this.serverMemberModel
            .find({ userId })
            .select('serverId')
            .lean();
        return members.map((m) => m.serverId as Types.ObjectId);
    }

    public async findUserIdsInServerIds(
        serverIds: Types.ObjectId[],
    ): Promise<Types.ObjectId[]> {
        if (serverIds.length === 0) return [];
        const userIds = await this.serverMemberModel
            .find({ serverId: { $in: serverIds } })
            .distinct('userId');
        return userIds as unknown as Types.ObjectId[];
    }

    public async countByServerId(serverId: Types.ObjectId): Promise<number> {
        return await this.serverMemberModel.countDocuments({ serverId });
    }

    // Delete a member record by its ID
    //
    // Low-level cleanup operation
    public async deleteById(id: Types.ObjectId): Promise<boolean> {
        const result = await this.serverMemberModel.deleteOne({ _id: id });
        return result.deletedCount > 0;
    }

    public async deleteByServerId(serverId: Types.ObjectId): Promise<void> {
        await this.serverMemberModel.deleteMany({ serverId });
    }

    public async removeRoleFromAllMembers(
        serverId: Types.ObjectId,
        roleId: Types.ObjectId,
    ): Promise<void> {
        await this.serverMemberModel.updateMany(
            { serverId },
            { $pull: { roles: roleId } },
        );
    }

    public async removeRoleFromMember(
        memberId: Types.ObjectId,
        roleId: Types.ObjectId,
    ): Promise<IServerMember | null> {
        return await this.serverMemberModel
            .findOneAndUpdate(
                { _id: memberId },
                { $pull: { roles: roleId } },
                { new: true },
            )
            .lean();
    }

    public async deleteAllForUser(
        userId: Types.ObjectId,
    ): Promise<{ deletedCount: number }> {
        const result = await this.serverMemberModel.deleteMany({ userId });
        return { deletedCount: result.deletedCount };
    }

    // Find all members of a server with user info populated
    //
    // Performs manual population by fetching users in a separate query
    public async findByServerIdWithUserInfo(
        serverId: Types.ObjectId,
    ): Promise<(IServerMember & { user: MappedUser | null })[]> {
        const members = await this.serverMemberModel.find({ serverId }).lean();
        const userIds = members.map((m) => m.userId);
        const users = await this.userModel
            .find({ _id: { $in: userIds } })
            .select(
                '-tokenVersion -permissions -password -settings -language -login -deletedReason',
            )
            .lean();

        return members.map((m) => {
            const user = users.find((u) => u._id.equals(m.userId));
            if (!user)
                return { ...m, user: null } as IServerMember & { user: null };

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
            } as IServerMember & { user: MappedUser | null };
        });
    }

    public async searchMembers(
        serverId: Types.ObjectId,
        query: string,
    ): Promise<(IServerMember & { user: MappedUser | null })[]> {
        const users = await this.userModel
            .find({
                $or: [
                    { username: { $regex: query, $options: 'i' } },
                    { displayName: { $regex: query, $options: 'i' } },
                ],
            })
            .select('_id')
            .lean();

        const userIds = users.map((u) => u._id);
        const members = await this.serverMemberModel
            .find({ serverId, userId: { $in: userIds } })
            .lean();

        const memberUserIds = members.map((m) => m.userId);
        const populatedUsers = await this.userModel
            .find({ _id: { $in: memberUserIds } })
            .select(
                '-tokenVersion -permissions -password -settings -language -login -deletedReason',
            )
            .lean();

        return members.map((m) => {
            const user = populatedUsers.find((u) => u._id.equals(m.userId));
            if (!user)
                return { ...m, user: null } as IServerMember & { user: null };

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
            } as IServerMember & { user: MappedUser | null };
        });
    }

    public async addRole(
        serverId: Types.ObjectId,
        userId: Types.ObjectId,
        roleId: Types.ObjectId,
    ): Promise<IServerMember> {
        const member = await this.serverMemberModel
            .findOneAndUpdate(
                { serverId, userId },
                { $addToSet: { roles: roleId } },
                { new: true },
            )
            .lean();
        if (!member) throw new Error(ErrorMessages.MEMBER.NOT_FOUND);
        return member;
    }

    public async removeRole(
        serverId: Types.ObjectId,
        userId: Types.ObjectId,
        roleId: Types.ObjectId,
    ): Promise<IServerMember> {
        const member = await this.serverMemberModel
            .findOneAndUpdate(
                { serverId, userId },
                { $pull: { roles: roleId } },
                { new: true },
            )
            .lean();
        if (!member) throw new Error(ErrorMessages.MEMBER.NOT_FOUND);
        return member;
    }

    public async removeRoleFromAll(
        serverId: Types.ObjectId,
        roleId: Types.ObjectId,
    ): Promise<void> {
        await this.removeRoleFromAllMembers(serverId, roleId);
    }
}
