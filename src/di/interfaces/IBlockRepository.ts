import type { Types } from 'mongoose';
import type { IBlockProfile } from '@/models/BlockProfile';
import type { IUserBlock } from '@/models/UserBlock';

export interface BlockWithFlags {
    targetId: string;
    targetUsername: string;
    profileId: string;
    flags: number;
}

export interface BlockedByWithFlags {
    blockerId: string;
    flags: number;
}

export interface IBlockRepository {
    createProfile(
        ownerId: Types.ObjectId,
        name: string,
        flags: number,
    ): Promise<IBlockProfile>;
    findProfilesByOwner(ownerId: Types.ObjectId): Promise<IBlockProfile[]>;
    findProfileById(profileId: Types.ObjectId): Promise<IBlockProfile | null>;
    updateProfile(
        profileId: Types.ObjectId,
        ownerId: Types.ObjectId,
        updates: { name?: string; flags?: number },
    ): Promise<IBlockProfile | null>;
    deleteProfile(
        profileId: Types.ObjectId,
        ownerId: Types.ObjectId,
    ): Promise<boolean>;
    countProfilesByOwner(ownerId: Types.ObjectId): Promise<number>;

    upsertBlock(
        blockerId: Types.ObjectId,
        targetId: Types.ObjectId,
        profileId: Types.ObjectId,
    ): Promise<IUserBlock>;
    deleteBlock(
        blockerId: Types.ObjectId,
        targetId: Types.ObjectId,
    ): Promise<boolean>;
    findBlocksByBlocker(blockerId: Types.ObjectId): Promise<BlockWithFlags[]>;
    findBlocksByTarget(targetId: Types.ObjectId): Promise<BlockedByWithFlags[]>;
    findBlock(
        blockerId: Types.ObjectId,
        targetId: Types.ObjectId,
    ): Promise<IUserBlock | null>;

    getActiveBlockFlags(
        blockerId: Types.ObjectId,
        targetId: Types.ObjectId,
    ): Promise<number>;
}
