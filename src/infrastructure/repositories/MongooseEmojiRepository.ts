import { injectable } from 'inversify';
import { IEmojiRepository, IEmoji } from '@/di/interfaces/IEmojiRepository';
import { Emoji } from '@/models/Emoji';

// Mongoose Emoji repository
//
// Implements IEmojiRepository using Mongoose Emoji model
@injectable()
export class MongooseEmojiRepository implements IEmojiRepository {
    async findById(id: string): Promise<IEmoji | null> {
        return await Emoji.findById(id).lean();
    }

    async findByServerId(serverId: string): Promise<IEmoji[]> {
        return await Emoji.find({ serverId }).lean();
    }

    async create(data: {
        name: string;
        imageUrl: string;
        serverId: string;
        createdBy: string;
    }): Promise<IEmoji> {
        const emoji = new Emoji(data);
        return await emoji.save();
    }

    async delete(id: string): Promise<boolean> {
        const result = await Emoji.deleteOne({ _id: id });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }

    // Find all emojis for a server with creator info populated
    async findByServerIdWithCreator(serverId: string): Promise<IEmoji[]> {
        return await Emoji.find({ serverId })
            .populate('createdBy', 'username')
            .sort({ createdAt: 1 })
            .lean();
    }

    // Find emoji by ID with creator info populated
    async findByIdWithCreator(id: string): Promise<IEmoji | null> {
        return await Emoji.findById(id)
            .populate('createdBy', 'username')
            .lean();
    }

    async findByServerAndName(
        serverId: string,
        name: string,
    ): Promise<IEmoji | null> {
        return await Emoji.findOne({ serverId, name }).lean();
    }

    async findByServerIds(serverIds: string[]): Promise<IEmoji[]> {
        return await Emoji.find({ serverId: { $in: serverIds } })
            .select('_id name imageUrl serverId createdBy createdAt')
            .sort({ name: 1 })
            .lean();
    }
}
