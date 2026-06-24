import { injectable } from 'inversify';
import { IEmojiRepository, IEmoji } from '@/di/interfaces/IEmojiRepository';
import { Emoji } from '@/models/Emoji';

// Mongoose Emoji repository
//
// Implements IEmojiRepository using Mongoose Emoji model
@injectable()
export class MongooseEmojiRepository implements IEmojiRepository {
    public async findById(id: string): Promise<IEmoji | null> {
        return await Emoji.findOne({ snowflakeId: id }).lean();
    }

    public async findByServerId(serverId: string): Promise<IEmoji[]> {
        return await Emoji.find({ serverId }).lean();
    }

    public async create(data: {
        name: string;
        imageUrl: string;
        serverId: string;
        createdBy: string;
    }): Promise<IEmoji> {
        const emoji = new Emoji(data);
        return await emoji.save();
    }

    public async delete(id: string): Promise<boolean> {
        const result = await Emoji.deleteOne({ snowflakeId: id });
        return result.deletedCount > 0;
    }

    // createdBy is a plain snowflakeId string, EmojiResponseDTO types it
    // as string, so populating it would be wasted work.
    public async findByServerIdWithCreator(
        serverId: string,
    ): Promise<IEmoji[]> {
        return await Emoji.find({ serverId }).sort({ createdAt: 1 }).lean();
    }

    public async findByIdWithCreator(id: string): Promise<IEmoji | null> {
        return await Emoji.findOne({ snowflakeId: id }).lean();
    }

    public async findByServerAndName(
        serverId: string,
        name: string,
    ): Promise<IEmoji | null> {
        return await Emoji.findOne({ serverId, name }).lean();
    }

    public async findByServerIds(serverIds: string[]): Promise<IEmoji[]> {
        return await Emoji.find({ serverId: { $in: serverIds } })
            .select(
                '_id snowflakeId name imageUrl serverId createdBy createdAt',
            )
            .sort({ name: 1 })
            .lean();
    }
}
