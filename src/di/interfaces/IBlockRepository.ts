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
        ownerId: string,
        name: string,
        flags: number,
    ): Promise<IBlockProfile>;
    findProfilesByOwner(ownerId: string): Promise<IBlockProfile[]>;
    findProfileById(profileId: string): Promise<IBlockProfile | null>;
    updateProfile(
        profileId: string,
        ownerId: string,
        updates: { name?: string; flags?: number },
    ): Promise<IBlockProfile | null>;
    deleteProfile(profileId: string, ownerId: string): Promise<boolean>;
    countProfilesByOwner(ownerId: string): Promise<number>;

    upsertBlock(
        blockerId: string,
        targetId: string,
        profileId: string,
    ): Promise<IUserBlock>;
    deleteBlock(blockerId: string, targetId: string): Promise<boolean>;
    findBlocksByBlocker(blockerId: string): Promise<BlockWithFlags[]>;
    findBlocksByTarget(targetId: string): Promise<BlockedByWithFlags[]>;
    findBlock(blockerId: string, targetId: string): Promise<IUserBlock | null>;

    getActiveBlockFlags(blockerId: string, targetId: string): Promise<number>;
}
