import { injectable } from 'inversify';
import {
    IVanityLink,
    IVanityLinkRepository,
} from '@/di/interfaces/IVanityLinkRepository';
import { VanityLink } from '@/models/VanityLink';

// Mongoose VanityLink repository
//
// Implements IVanityLinkRepository using Mongoose VanityLink model
@injectable()
export class MongooseVanityLinkRepository implements IVanityLinkRepository {
    public async findByServerId(serverId: string): Promise<IVanityLink | null> {
        return await VanityLink.findOne({ serverId }).lean();
    }

    public async findByCode(code: string): Promise<IVanityLink | null> {
        return await VanityLink.findOne({ code }).lean();
    }

    public async setForServer(
        serverId: string,
        code: string,
        createdByUserId: string,
    ): Promise<IVanityLink> {
        return await VanityLink.findOneAndUpdate(
            { serverId },
            { $set: { code, createdByUserId } },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true,
            },
        ).lean();
    }

    public async deleteByServerId(serverId: string): Promise<boolean> {
        const result = await VanityLink.deleteOne({ serverId });
        return result.deletedCount > 0;
    }
}
