import { injectable } from 'inversify';
import {
    CreateInviteDTO,
    IInvite,
    IInviteRepository,
} from '@/di/interfaces/IInviteRepository';
import { Invite } from '@/models/Server';

// Mongoose Invite repository
//
// Implements IInviteRepository using Mongoose Invite model
@injectable()
export class MongooseInviteRepository implements IInviteRepository {
    public async findByCode(code: string): Promise<IInvite | null> {
        return await Invite.findOne({ code }).lean();
    }

    public async findById(id: string): Promise<IInvite | null> {
        return await Invite.findOne({
            snowflakeId: id,
        }).lean();
    }

    public async findByServerId(serverId: string): Promise<IInvite[]> {
        return await Invite.find({ serverId }).lean();
    }

    public async create(data: CreateInviteDTO): Promise<IInvite> {
        const invite = new Invite({
            ...data,
            uses: 0,
        });
        const saved = await invite.save();
        return saved.toObject({ transform: false });
    }

    public async incrementUses(id: string): Promise<IInvite | null> {
        return await Invite.findOneAndUpdate(
            { snowflakeId: id },
            { $inc: { uses: 1 } },
            { returnDocument: 'after' },
        ).lean();
    }

    public async claimUse(id: string): Promise<IInvite | null> {
        return await Invite.findOneAndUpdate(
            {
                snowflakeId: id,
                $or: [
                    { maxUses: { $exists: false } },
                    { maxUses: 0 },
                    { $expr: { $lt: ['$uses', '$maxUses'] } },
                ],
            },
            { $inc: { uses: 1 } },
            { returnDocument: 'after' },
        ).lean();
    }

    public async releaseUse(id: string): Promise<IInvite | null> {
        return await Invite.findOneAndUpdate(
            { snowflakeId: id, uses: { $gt: 0 } },
            { $inc: { uses: -1 } },
            { returnDocument: 'after' },
        ).lean();
    }

    public async delete(id: string): Promise<boolean> {
        const result = await Invite.deleteOne({ snowflakeId: id });
        return result.deletedCount > 0;
    }

    public async deleteByServerId(serverId: string): Promise<number> {
        const result = await Invite.deleteMany({ serverId });
        return result.deletedCount;
    }
}
