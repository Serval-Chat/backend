import { injectable } from 'inversify';
import {
    CreateInviteDTO,
    IInvite,
    IInviteRepository,
} from '@/di/interfaces/IInviteRepository';
import { Invite } from '@/models/Server';
import type { FilterQuery } from 'mongoose';

// Mongoose Invite repository
//
// Implements IInviteRepository using Mongoose Invite model
@injectable()
export class MongooseInviteRepository implements IInviteRepository {
    async findByCode(code: string): Promise<IInvite | null> {
        return (await Invite.findOne({ code }).lean()) as IInvite | null;
    }

    async findById(id: string): Promise<IInvite | null> {
        return (await Invite.findById(id).lean()) as IInvite | null;
    }

    async findByCustomPath(customPath: string): Promise<IInvite | null> {
        return (await Invite.findOne({ customPath }).lean()) as IInvite | null;
    }

    // Find invite by code or custom path
    //
    // Query that checks 'code', 'customPath', and optionally '_id'
    // If the input is a valid ObjectId
    async findByCodeOrCustomPath(codeOrPath: string): Promise<IInvite | null> {
        const query: FilterQuery<IInvite> = {
            $or: [{ code: codeOrPath }, { customPath: codeOrPath }],
        };

        // If it's a valid ObjectId, also check by _id
        if (codeOrPath.match(/^[0-9a-fA-F]{24}$/)) {
            query.$or!.push({
                _id: codeOrPath as unknown as FilterQuery<IInvite>,
            });
        }

        return (await Invite.findOne(query).lean()) as IInvite | null;
    }

    async findByServerId(serverId: string): Promise<IInvite[]> {
        return (await Invite.find({ serverId }).lean()) as unknown as IInvite[];
    }

    async create(data: CreateInviteDTO): Promise<IInvite> {
        const invite = new Invite({
            ...data,
            uses: 0,
        });
        return (await invite.save()) as unknown as IInvite;
    }

    async incrementUses(id: string): Promise<IInvite | null> {
        return (await Invite.findByIdAndUpdate(
            id,
            { $inc: { uses: 1 } },
            { new: true },
        ).lean()) as IInvite | null;
    }

    async delete(id: string): Promise<boolean> {
        const result = await Invite.deleteOne({ _id: id });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }

    async deleteByServerId(serverId: string): Promise<number> {
        const result = await Invite.deleteMany({ serverId });
        return result.deletedCount || 0;
    }
}
