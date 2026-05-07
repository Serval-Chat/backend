import { Injectable } from '@nestjs/common';
import { injectable } from 'inversify';
import { Types } from 'mongoose';
import { BlockProfile, IBlockProfile } from '@/models/BlockProfile';
import { UserBlock, IUserBlock } from '@/models/UserBlock';
import {
    IBlockRepository,
    BlockWithFlags,
    BlockedByWithFlags,
} from '@/di/interfaces/IBlockRepository';

@injectable()
@Injectable()
export class MongooseBlockRepository implements IBlockRepository {
    public async createProfile(
        ownerId: Types.ObjectId,
        name: string,
        flags: number,
    ): Promise<IBlockProfile> {
        return await BlockProfile.create({ ownerId, name, flags });
    }

    public async findProfilesByOwner(
        ownerId: Types.ObjectId,
    ): Promise<IBlockProfile[]> {
        return await BlockProfile.find({ ownerId })
            .sort({ createdAt: 1 })
            .exec();
    }

    public async findProfileById(
        profileId: Types.ObjectId,
    ): Promise<IBlockProfile | null> {
        return await BlockProfile.findById(profileId).exec();
    }

    public async updateProfile(
        profileId: Types.ObjectId,
        ownerId: Types.ObjectId,
        updates: { name?: string; flags?: number },
    ): Promise<IBlockProfile | null> {
        return await BlockProfile.findOneAndUpdate(
            { _id: profileId, ownerId },
            { $set: updates },
            { new: true },
        ).exec();
    }

    public async deleteProfile(
        profileId: Types.ObjectId,
        ownerId: Types.ObjectId,
    ): Promise<boolean> {
        await UserBlock.deleteMany({ profileId, blockerId: ownerId }).exec();

        const result = await BlockProfile.deleteOne({
            _id: profileId,
            ownerId,
        }).exec();

        return result.deletedCount > 0;
    }

    public async countProfilesByOwner(
        ownerId: Types.ObjectId,
    ): Promise<number> {
        return await BlockProfile.countDocuments({ ownerId }).exec();
    }

    public async upsertBlock(
        blockerId: Types.ObjectId,
        targetId: Types.ObjectId,
        profileId: Types.ObjectId,
    ): Promise<IUserBlock> {
        return (await UserBlock.findOneAndUpdate(
            { blockerId, targetId },
            { $set: { profileId } },
            { upsert: true, new: true },
        ).exec()) as IUserBlock;
    }

    public async deleteBlock(
        blockerId: Types.ObjectId,
        targetId: Types.ObjectId,
    ): Promise<boolean> {
        const result = await UserBlock.deleteOne({
            blockerId,
            targetId,
        }).exec();
        return result.deletedCount > 0;
    }

    public async findBlocksByBlocker(
        blockerId: Types.ObjectId,
    ): Promise<BlockWithFlags[]> {
        const blocks = await UserBlock.find({ blockerId })
            .populate('profileId')
            .populate('targetId', 'username')
            .exec();

        return blocks.map((b) => {
            const profile = b.profileId as unknown as IBlockProfile | null;
            const target = b.targetId as unknown as {
                _id: Types.ObjectId;
                username: string;
            } | null;

            const rawTargetId = b.get('targetId');
            const rawProfileId = b.get('profileId');

            return {
                targetId: target
                    ? target._id.toString()
                    : rawTargetId.toString(),
                targetUsername: target ? target.username : 'Deleted User',
                profileId: profile
                    ? profile._id.toString()
                    : rawProfileId.toString(),
                flags: profile ? profile.flags : 0,
            };
        });
    }

    public async findBlocksByTarget(
        targetId: Types.ObjectId,
    ): Promise<BlockedByWithFlags[]> {
        const blocks = await UserBlock.find({ targetId })
            .populate('profileId')
            .exec();

        return blocks.map((b) => {
            const profile = b.profileId as unknown as IBlockProfile | null;
            return {
                blockerId: b.blockerId.toString(),
                flags: profile ? profile.flags : 0,
            };
        });
    }

    public async findBlock(
        blockerId: Types.ObjectId,
        targetId: Types.ObjectId,
    ): Promise<IUserBlock | null> {
        return await UserBlock.findOne({ blockerId, targetId }).exec();
    }

    public async getActiveBlockFlags(
        blockerId: Types.ObjectId,
        targetId: Types.ObjectId,
    ): Promise<number> {
        const block = await UserBlock.findOne({ blockerId, targetId })
            .populate('profileId')
            .exec();
        if (block === null) return 0;

        const profile = block.profileId as unknown as IBlockProfile | null;
        return profile ? profile.flags : 0;
    }
}
