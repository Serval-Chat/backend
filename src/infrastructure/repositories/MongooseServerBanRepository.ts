import { injectable } from 'inversify';
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
        serverId: string,
        userId: string,
    ): Promise<IServerBan | null> {
        return await ServerBan.findOne({ serverId, userId }).lean();
    }

    async findByServerId(serverId: string): Promise<IServerBan[]> {
        return await ServerBan.find({ serverId }).lean();
    }

    async findByServerIdWithUserInfo(
        serverId: string,
    ): Promise<(IServerBan & { user: MappedUser | null })[]> {
        const bans = await ServerBan.find({ serverId }).lean();
        const userIds = bans.map((b) => b.userId.toString());
        const users = await User.find({ _id: { $in: userIds } }).lean();

        return bans.map((b) => {
            const user = users.find(
                (u) => u._id.toString() === b.userId.toString(),
            );
            return {
                ...b,
                user: user ? mapUser(user) : null,
            };
        });
    }

    async create(data: CreateServerBanDTO): Promise<IServerBan> {
        const ban = new ServerBan(data);
        return await ban.save();
    }

    async delete(id: string): Promise<boolean> {
        const result = await ServerBan.deleteOne({ _id: id });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }

    async deleteByServerId(serverId: string): Promise<number> {
        const result = await ServerBan.deleteMany({ serverId });
        return result.deletedCount || 0;
    }

    // Unban user from server
    // Removes the ban record for the specified user and server
    async unban(serverId: string, userId: string): Promise<boolean> {
        const result = await ServerBan.deleteOne({ serverId, userId });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }
}
