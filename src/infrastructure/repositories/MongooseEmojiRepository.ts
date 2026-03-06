import { injectable } from 'inversify';
import { Types } from 'mongoose';
import { IEmojiRepository, IEmoji } from '@/di/interfaces/IEmojiRepository';
import { Emoji } from '@/models/Emoji';

// Mongoose Emoji repository
//
// Implements IEmojiRepository using Mongoose Emoji model
@injectable()
export class MongooseEmojiRepository implements IEmojiRepository {
    async findById(id: Types.ObjectId): Promise<IEmoji | null> {
        return await Emoji.findById(id).lean();
    }

    async findByServerId(serverId: Types.ObjectId): Promise<IEmoji[]> {
        return await Emoji.find({ serverId }).lean();
    }

    async create(data: {
        name: string;
        imageUrl: string;
        serverId: Types.ObjectId;
        createdBy: Types.ObjectId;
    }): Promise<IEmoji> {
        const emoji = new Emoji(data);
        return await emoji.save();
    }

    async delete(id: Types.ObjectId): Promise<boolean> {
        const result = await Emoji.deleteOne({ _id: id });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }

    // Find all emojis for a server with creator info populated
    async findByServerIdWithCreator(
        serverId: Types.ObjectId,
    ): Promise<IEmoji[]> {
        return await Emoji.find({ serverId })
            .populate('createdBy', 'username')
            .sort({ createdAt: 1 })
            .lean();
    }

    // Find emoji by ID with creator info populated
    async findByIdWithCreator(id: Types.ObjectId): Promise<IEmoji | null> {
        return await Emoji.findById(id)
            .populate('createdBy', 'username')
            .lean();
    }

    async findByServerAndName(
        serverId: Types.ObjectId,
        name: string,
    ): Promise<IEmoji | null> {
        return await Emoji.findOne({ serverId, name }).lean();
    }

    async findByServerIds(serverIds: Types.ObjectId[]): Promise<IEmoji[]> {
        return await Emoji.find({ serverId: { $in: serverIds } })
            .select('_id name imageUrl serverId createdBy createdAt')
            .sort({ name: 1 })
            .lean();
    }
}
