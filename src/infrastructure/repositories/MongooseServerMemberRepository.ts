import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import {
    IServerMemberRepository,
    IServerMember,
} from '@/di/interfaces/IServerMemberRepository';
import { IUser } from '@/di/interfaces/IUserRepository';
import { mapUser } from '@/utils/user';
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
    constructor() { }

    async findByServerAndUser(
        serverId: string,
        userId: string,
    ): Promise<IServerMember | null> {
        return await this.serverMemberModel.findOne({ serverId, userId }).lean();
    }

    async findByServerId(serverId: string): Promise<IServerMember[]> {
        return await this.serverMemberModel.find({ serverId }).lean();
    }

    async create(data: {
        serverId: string;
        userId: string;
        roles: string[];
    }): Promise<IServerMember> {
        const member = new this.serverMemberModel(data);
        return await member.save();
    }

    async updateRoles(
        serverId: string,
        userId: string,
        roles: string[],
    ): Promise<IServerMember | null> {
        return await this.serverMemberModel.findOneAndUpdate(
            { serverId, userId },
            { roles },
            { new: true },
        ).lean();
    }

    // Remove a member from a server
    //
    // Operation for leaving or kicking a member
    async remove(serverId: string, userId: string): Promise<boolean> {
        const result = await this.serverMemberModel.deleteOne({ serverId, userId });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }

    async isMember(serverId: string, userId: string): Promise<boolean> {
        const member = await this.serverMemberModel.findOne({ serverId, userId });
        return !!member;
    }

    async findAllByUserId(userId: string): Promise<IServerMember[]> {
        return await this.serverMemberModel.find({ userId }).lean();
    }

    async findByUserId(userId: string): Promise<IServerMember[]> {
        return await this.findAllByUserId(userId);
    }

    async findServerIdsByUserId(userId: string): Promise<string[]> {
        const members = await this.serverMemberModel.find({ userId })
            .select('serverId')
            .lean();
        return members.map((m) => m.serverId.toString());
    }

    async countByServerId(serverId: string): Promise<number> {
        return await this.serverMemberModel.countDocuments({ serverId });
    }

    // Delete a member record by its ID
    //
    // Low-level cleanup operation
    async deleteById(id: string): Promise<boolean> {
        const result = await this.serverMemberModel.deleteOne({ _id: id });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }

    async deleteByServerId(serverId: string): Promise<void> {
        await this.serverMemberModel.deleteMany({ serverId });
    }

    async removeRoleFromAllMembers(
        serverId: string,
        roleId: string,
    ): Promise<void> {
        await this.serverMemberModel.updateMany(
            { serverId },
            { $pull: { roles: roleId } },
        );
    }

    async removeRoleFromMember(
        memberId: string,
        roleId: string,
    ): Promise<IServerMember | null> {
        return await this.serverMemberModel.findOneAndUpdate(
            { _id: memberId },
            { $pull: { roles: roleId } },
            { new: true },
        ).lean();
    }

    async deleteAllForUser(userId: string): Promise<{ deletedCount: number }> {
        const result = await this.serverMemberModel.deleteMany({ userId });
        return { deletedCount: result.deletedCount };
    }

    // Find all members of a server with user info populated
    //
    // Performs manual population by fetching users in a separate query
    async findByServerIdWithUserInfo(serverId: string): Promise<any[]> {
        const members = await this.serverMemberModel.find({ serverId }).lean();
        const userIds = members.map((m) => m.userId.toString());
        const users = await this.userModel.find({ _id: { $in: userIds } }).lean();

        return members.map((m) => {
            const user = users.find(
                (u) => u._id.toString() === m.userId.toString(),
            );
            return {
                ...m,
                user: user ? mapUser(user) : null,
            };
        });
    }

    async searchMembers(serverId: string, query: string): Promise<any[]> {
        const users = await this.userModel.find({
            $or: [
                { username: { $regex: query, $options: 'i' } },
                { displayName: { $regex: query, $options: 'i' } },
            ],
        })
            .select('_id')
            .lean();

        const userIds = users.map((u) => u._id);
        const members = await this.serverMemberModel.find({
            serverId,
            userId: { $in: userIds },
        }).lean();

        const memberUserIds = members.map((m) => m.userId.toString());
        const populatedUsers = await this.userModel.find({
            _id: { $in: memberUserIds },
        }).lean();

        return members.map((m) => {
            const user = populatedUsers.find(
                (u) => u._id.toString() === m.userId.toString(),
            );
            return {
                ...m,
                user: user ? mapUser(user) : null,
            };
        });
    }

    async addRole(
        serverId: string,
        userId: string,
        roleId: string,
    ): Promise<IServerMember> {
        const member = await this.serverMemberModel.findOneAndUpdate(
            { serverId, userId },
            { $addToSet: { roles: roleId } },
            { new: true },
        ).lean();
        if (!member) throw new Error(ErrorMessages.MEMBER.NOT_FOUND);
        return member;
    }

    async removeRole(
        serverId: string,
        userId: string,
        roleId: string,
    ): Promise<IServerMember> {
        const member = await this.serverMemberModel.findOneAndUpdate(
            { serverId, userId },
            { $pull: { roles: roleId } },
            { new: true },
        ).lean();
        if (!member) throw new Error(ErrorMessages.MEMBER.NOT_FOUND);
        return member;
    }

    async removeRoleFromAll(serverId: string, roleId: string): Promise<void> {
        await this.removeRoleFromAllMembers(serverId, roleId);
    }
}

