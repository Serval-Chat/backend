import { injectable } from 'inversify';
import {
    IStickerRepository,
    ISticker,
} from '@/di/interfaces/IStickerRepository';
import { Sticker } from '@/models/Sticker';

@injectable()
export class MongooseStickerRepository implements IStickerRepository {
    public async findById(id: string): Promise<ISticker | null> {
        return await Sticker.findOne({ snowflakeId: id }).lean();
    }

    public async findByServerId(serverId: string): Promise<ISticker[]> {
        return await Sticker.find({ serverId }).lean();
    }

    public async create(data: {
        name: string;
        imageUrl: string;
        isAnimated: boolean;
        serverId: string;
        createdBy: string;
    }): Promise<ISticker> {
        const sticker = new Sticker(data);
        return await sticker.save();
    }

    public async delete(id: string): Promise<boolean> {
        const result = await Sticker.deleteOne({ snowflakeId: id });
        return result.deletedCount > 0;
    }

    // createdBy is a plain snowflakeId string, StickerResponseDTO types it
    // as string, so populating it would be wasted work.
    public async findByServerIdWithCreator(
        serverId: string,
    ): Promise<ISticker[]> {
        return await Sticker.find({ serverId }).sort({ createdAt: 1 }).lean();
    }

    public async findByIdWithCreator(id: string): Promise<ISticker | null> {
        return await Sticker.findOne({ snowflakeId: id }).lean();
    }

    public async findByServerAndName(
        serverId: string,
        name: string,
    ): Promise<ISticker | null> {
        return await Sticker.findOne({ serverId, name }).lean();
    }

    public async findByServerIds(serverIds: string[]): Promise<ISticker[]> {
        return await Sticker.find({ serverId: { $in: serverIds } })
            .select(
                '_id snowflakeId name imageUrl isAnimated serverId createdBy createdAt',
            )
            .sort({ name: 1 })
            .lean();
    }
}
