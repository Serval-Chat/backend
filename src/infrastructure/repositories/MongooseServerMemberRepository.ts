import { injectable } from 'inversify';
import {
    IServerMemberRepository,
    IServerMember,
} from '../../di/interfaces/IServerMemberRepository';
import { ServerMember } from '../../models/Server';
import { User } from '../../models/User';
import { mapUser } from '../../utils/user';
import { ErrorMessages } from '../../constants/errorMessages';

/**
 * Mongoose Server Member Repository
 *
 * Implements IServerMemberRepository using Mongoose ServerMember model.
 */
@injectable()
export class MongooseServerMemberRepository implements IServerMemberRepository {
    async findByServerAndUser(
        serverId: string,
        userId: string,
    ): Promise<IServerMember | null> {
        return await ServerMember.findOne({ serverId, userId }).lean();
    }

    async findByServerId(serverId: string): Promise<IServerMember[]> {
        return await ServerMember.find({ serverId }).lean();
    }

    async create(data: {
        serverId: string;
        userId: string;
        roles: string[];
    }): Promise<IServerMember> {
        const member = new ServerMember(data);
        return await member.save();
    }

    async updateRoles(
        serverId: string,
        userId: string,
        roles: string[],
    ): Promise<IServerMember | null> {
        return await ServerMember.findOneAndUpdate(
            { serverId, userId },
            { roles },
            { new: true },
        ).lean();
    }

    /**
     * Remove a member from a server.
     *
     * Operation for leaving or kicking a member.
     */
    async remove(serverId: string, userId: string): Promise<boolean> {
        const result = await ServerMember.deleteOne({ serverId, userId });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }

    async isMember(serverId: string, userId: string): Promise<boolean> {
        const member = await ServerMember.findOne({ serverId, userId });
        return !!member;
    }

    async findAllByUserId(userId: string): Promise<IServerMember[]> {
        return await ServerMember.find({ userId }).lean();
    }

    async findByUserId(userId: string): Promise<IServerMember[]> {
        return await this.findAllByUserId(userId);
    }

    async findServerIdsByUserId(userId: string): Promise<string[]> {
        const members = await ServerMember.find({ userId })
            .select('serverId')
            .lean();
        return members.map((m) => m.serverId.toString());
    }

    async countByServerId(serverId: string): Promise<number> {
        return await ServerMember.countDocuments({ serverId });
    }

    /**
     * Delete a member record by its ID.
     *
     * Low-level cleanup operation.
     */
    async deleteById(id: string): Promise<boolean> {
        const result = await ServerMember.deleteOne({ _id: id });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }

    async deleteByServerId(serverId: string): Promise<void> {
        await ServerMember.deleteMany({ serverId });
    }

    async removeRoleFromAllMembers(
        serverId: string,
        roleId: string,
    ): Promise<void> {
        await ServerMember.updateMany(
            { serverId },
            { $pull: { roles: roleId } },
        );
    }

    async removeRoleFromMember(
        memberId: string,
        roleId: string,
    ): Promise<IServerMember | null> {
        return await ServerMember.findOneAndUpdate(
            { _id: memberId },
            { $pull: { roles: roleId } },
            { new: true },
        ).lean();
    }

    async deleteAllForUser(userId: string): Promise<{ deletedCount: number }> {
        const result = await ServerMember.deleteMany({ userId });
        return { deletedCount: result.deletedCount };
    }

    /**
     * Find all members of a server with user info populated.
     *
     * Performs manual population by fetching users in a separate query.
     */
    async findByServerIdWithUserInfo(serverId: string): Promise<any[]> {
        const members = await ServerMember.find({ serverId }).lean();
        const userIds = members.map((m) => m.userId.toString());
        const users = await User.find({ _id: { $in: userIds } }).lean();

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
        const users = await User.find({
            $or: [
                { username: { $regex: query, $options: 'i' } },
                { displayName: { $regex: query, $options: 'i' } },
            ],
        })
            .select('_id')
            .lean();

        const userIds = users.map((u) => u._id);
        const members = await ServerMember.find({
            serverId,
            userId: { $in: userIds },
        }).lean();

        const memberUserIds = members.map((m) => m.userId.toString());
        const populatedUsers = await User.find({
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
        const member = await ServerMember.findOneAndUpdate(
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
        const member = await ServerMember.findOneAndUpdate(
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
