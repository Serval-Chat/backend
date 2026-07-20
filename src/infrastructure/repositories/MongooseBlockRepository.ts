import { injectable } from 'inversify';
import { BlockProfile, IBlockProfile } from '@/models/BlockProfile';
import { UserBlock, IUserBlock } from '@/models/UserBlock';
import {
    IBlockRepository,
    BlockWithFlags,
    BlockedByWithFlags,
} from '@/di/interfaces/IBlockRepository';

@injectable()
export class MongooseBlockRepository implements IBlockRepository {
    public async createProfile(
        ownerId: string,
        name: string,
        flags: number,
    ): Promise<IBlockProfile> {
        return await BlockProfile.create({ ownerId, name, flags });
    }

    public async findProfilesByOwner(
        ownerId: string,
    ): Promise<IBlockProfile[]> {
        return await BlockProfile.find({ ownerId })
            .sort({ createdAt: 1 })
            .exec();
    }

    public async findProfileById(
        profileId: string,
    ): Promise<IBlockProfile | null> {
        return await BlockProfile.findOne({ snowflakeId: profileId }).exec();
    }

    public async updateProfile(
        profileId: string,
        ownerId: string,
        updates: { name?: string; flags?: number },
    ): Promise<IBlockProfile | null> {
        return await BlockProfile.findOneAndUpdate(
            { snowflakeId: profileId, ownerId },
            { $set: updates },
            { returnDocument: 'after' },
        ).exec();
    }

    public async deleteProfile(
        profileId: string,
        ownerId: string,
    ): Promise<boolean> {
        await UserBlock.deleteMany({ profileId, blockerId: ownerId }).exec();

        const result = await BlockProfile.deleteOne({
            snowflakeId: profileId,
            ownerId,
        }).exec();

        return result.deletedCount > 0;
    }

    public async countProfilesByOwner(ownerId: string): Promise<number> {
        return await BlockProfile.countDocuments({ ownerId }).exec();
    }

    public async upsertBlock(
        blockerId: string,
        targetId: string,
        profileId: string,
    ): Promise<IUserBlock> {
        return await UserBlock.findOneAndUpdate(
            { blockerId, targetId },
            { $set: { profileId } },
            { upsert: true, returnDocument: 'after' },
        ).exec();
    }

    public async deleteBlock(
        blockerId: string,
        targetId: string,
    ): Promise<boolean> {
        const result = await UserBlock.deleteOne({
            blockerId,
            targetId,
        }).exec();
        return result.deletedCount > 0;
    }

    public async findBlocksByBlocker(
        blockerId: string,
    ): Promise<BlockWithFlags[]> {
        const blocks = await UserBlock.find({ blockerId })
            .populate<{
                profileIdProfile: IBlockProfile | null;
            }>('profileIdProfile')
            .populate<{
                targetIdUser: { username: string } | null;
            }>('targetIdUser', 'username')
            .exec();

        return blocks.map((b) => ({
            targetId: b.targetId,
            targetUsername: b.targetIdUser
                ? b.targetIdUser.username
                : 'Deleted User',
            profileId: b.profileIdProfile
                ? b.profileIdProfile.snowflakeId
                : b.profileId,
            flags: b.profileIdProfile ? b.profileIdProfile.flags : 0,
        }));
    }

    public async findBlocksByTarget(
        targetId: string,
    ): Promise<BlockedByWithFlags[]> {
        const blocks = await UserBlock.find({ targetId })
            .populate<{
                profileIdProfile: IBlockProfile | null;
            }>('profileIdProfile')
            .exec();

        return blocks.map((b) => ({
            blockerId: b.blockerId,
            flags: b.profileIdProfile ? b.profileIdProfile.flags : 0,
        }));
    }

    public async findBlock(
        blockerId: string,
        targetId: string,
    ): Promise<IUserBlock | null> {
        return await UserBlock.findOne({ blockerId, targetId }).exec();
    }

    public async getActiveBlockFlags(
        blockerId: string,
        targetId: string,
    ): Promise<number> {
        const block = await UserBlock.findOne({ blockerId, targetId })
            .populate<{
                profileIdProfile: IBlockProfile | null;
            }>('profileIdProfile')
            .exec();
        if (block === null) return 0;

        return block.profileIdProfile ? block.profileIdProfile.flags : 0;
    }
}
