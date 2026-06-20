import { Types } from 'mongoose';
import type { QueryFilter } from 'mongoose';

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
        return (await Invite.findOne({ code }).lean()) as IInvite | null;
    }

    public async findById(id: Types.ObjectId): Promise<IInvite | null> {
        return (await Invite.findById(id).lean()) as IInvite | null;
    }

    public async findByCustomPath(customPath: string): Promise<IInvite | null> {
        return (await Invite.findOne({ customPath }).lean()) as IInvite | null;
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

        if (codeOrPath.match(/^[0-9a-fA-F]{24}$/)) {
            query.$or?.push({ _id: codeOrPath });
        }

        return (await Invite.findOne(query).lean()) as IInvite | null;
    }

    public async findByServerId(serverId: Types.ObjectId): Promise<IInvite[]> {
        return (await Invite.find({ serverId }).lean()) as unknown as IInvite[];
    }

    public async findDiscoveryInviteByServerId(
        serverId: Types.ObjectId,
    ): Promise<IInvite | null> {
        return (await Invite.findOne({
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
            .lean()) as IInvite | null;
    }

    public async create(data: CreateInviteDTO): Promise<IInvite> {
        const invite = new Invite({
            ...data,
            customPath: data.customPath,
            uses: 0,
        });
        return (await invite.save()) as unknown as IInvite;
    }

    public async incrementUses(id: Types.ObjectId): Promise<IInvite | null> {
        return (await Invite.findByIdAndUpdate(
            id,
            { $inc: { uses: 1 } },
            { new: true },
        ).lean()) as IInvite | null;
    }

    public async delete(id: Types.ObjectId): Promise<boolean> {
        const result = await Invite.deleteOne({ _id: id });
        return result.deletedCount > 0;
    }

    public async deleteByServerId(serverId: Types.ObjectId): Promise<number> {
        const result = await Invite.deleteMany({ serverId });
        return result.deletedCount;
    }
}
