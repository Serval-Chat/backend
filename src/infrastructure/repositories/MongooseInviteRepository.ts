import type { QueryFilter } from 'mongoose';

import { injectable } from 'inversify';
import {
    CreateInviteDTO,
    IInvite,
    IInviteRepository,
} from '@/di/interfaces/IInviteRepository';
import { Invite } from '@/models/Server';
import { isValidSnowflakeId } from '@/utils/snowflake';

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

    public async findByCustomPath(customPath: string): Promise<IInvite | null> {
        return await Invite.findOne({ customPath }).lean();
    }

    // Find invite by code or custom path
    //
    // Query that checks 'code', 'customPath', and optionally '_id'
    // If the input is a valid ObjectId
    public async findByCodeOrCustomPath(
        codeOrPath: string,
    ): Promise<IInvite | null> {
        const query: QueryFilter<IInvite> = {
            $or: [{ code: codeOrPath }, { customPath: codeOrPath }],
        };

        if (isValidSnowflakeId(codeOrPath)) {
            query.$or?.push({ snowflakeId: codeOrPath });
        }

        return await Invite.findOne(query).lean();
    }

    public async findByServerId(serverId: string): Promise<IInvite[]> {
        return await Invite.find({ serverId }).lean();
    }

    public async findDiscoveryInviteByServerId(
        serverId: string,
    ): Promise<IInvite | null> {
        return await Invite.findOne({
            serverId,
            $and: [
                { $or: [{ maxUses: { $exists: false } }, { maxUses: 0 }] },
                {
                    $or: [
                        { expiresAt: { $exists: false } },
                        { expiresAt: null },
                    ],
                },
                {
                    $or: [
                        { customPath: { $exists: true, $ne: '' } },
                        { code: { $not: /^[0-9a-fA-F]{8}$/ } },
                    ],
                },
            ],
        })
            .sort({ createdAt: 1 })
            .lean();
    }

    public async findPreferredByServerId(
        serverId: string,
    ): Promise<IInvite | null> {
        return await Invite.findOne({
            serverId,
            customPath: { $exists: true, $ne: '' },
        })
            .sort({ createdAt: 1 })
            .lean();
    }

    public async create(data: CreateInviteDTO): Promise<IInvite> {
        const invite = new Invite({
            ...data,
            customPath: data.customPath,
            uses: 0,
        });
        const saved = await invite.save();
        return saved.toObject({ transform: false });
    }

    public async incrementUses(id: string): Promise<IInvite | null> {
        return await Invite.findOneAndUpdate(
            { snowflakeId: id },
            { $inc: { uses: 1 } },
            { new: true },
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
