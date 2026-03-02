import { injectable } from 'inversify';
import { Types } from 'mongoose';
import { User } from '@/models/User';
import { mapUser, MappedUser } from '@/utils/user';
import {
    IServerBanRepository,
    IServerBan,
    CreateServerBanDTO,
} from '@/di/interfaces/IServerBanRepository';
import { ServerBan } from '@/models/Server';

// Mongoose Server Ban repository
//
// Implements IServerBanRepository using Mongoose ServerBan model
@injectable()
export class MongooseServerBanRepository implements IServerBanRepository {
    async findByServerAndUser(
        serverId: Types.ObjectId,
        userId: Types.ObjectId,
    ): Promise<IServerBan | null> {
        return await ServerBan.findOne({ serverId, userId }).lean();
    }

    async findByServerId(serverId: Types.ObjectId): Promise<IServerBan[]> {
        return await ServerBan.find({ serverId }).lean();
    }

    async findByServerIdWithUserInfo(
        serverId: Types.ObjectId,
    ): Promise<(IServerBan & { user: MappedUser | null })[]> {
        const bans = await ServerBan.find({ serverId }).lean();
        const userIds = bans.map((b) => b.userId);
        const users = await User.find({ _id: { $in: userIds } })
            .select('-tokenVersion -permissions -password -settings -language -login -deletedReason')
            .lean();

        return bans.map((b) => {
            const user = users.find((u) => u._id.equals(b.userId));
            if (!user) return { ...b, user: null };
            const { tokenVersion, permissions, password, settings, language, login, deletedReason, ...safeUser } = user;
            return { ...b, user: mapUser(safeUser) };
        });
    }

    async create(data: CreateServerBanDTO): Promise<IServerBan> {
        const ban = new ServerBan(data);
        return await ban.save();
    }

    async delete(id: Types.ObjectId): Promise<boolean> {
        const result = await ServerBan.deleteOne({ _id: id });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }

    async deleteByServerId(serverId: Types.ObjectId): Promise<number> {
        const result = await ServerBan.deleteMany({ serverId });
        return result.deletedCount || 0;
    }

    // Unban user from server
    // Removes the ban record for the specified user and server
    async unban(serverId: Types.ObjectId, userId: Types.ObjectId): Promise<boolean> {
        const result = await ServerBan.deleteOne({ serverId, userId });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }
}
