import { Injectable } from '@nestjs/common';
import { injectable } from 'inversify';
import { Types } from 'mongoose';
import {
    IStickerRepository,
    ISticker,
} from '@/di/interfaces/IStickerRepository';
import { Sticker } from '@/models/Sticker';

@injectable()
@Injectable()
export class MongooseStickerRepository implements IStickerRepository {
    public async findById(id: Types.ObjectId): Promise<ISticker | null> {
        return await Sticker.findById(id).lean();
    }

    public async findByServerId(serverId: Types.ObjectId): Promise<ISticker[]> {
        return await Sticker.find({ serverId }).lean();
    }

    public async create(data: {
        name: string;
        imageUrl: string;
        isAnimated: boolean;
        serverId: Types.ObjectId;
        createdBy: Types.ObjectId;
    }): Promise<ISticker> {
        const sticker = new Sticker(data);
        return await sticker.save();
    }

    public async delete(id: Types.ObjectId): Promise<boolean> {
        const result = await Sticker.deleteOne({ _id: id });
        return result.deletedCount > 0;
    }

    public async findByServerIdWithCreator(
        serverId: Types.ObjectId,
    ): Promise<ISticker[]> {
        return await Sticker.find({ serverId })
            .populate('createdBy', 'username')
            .sort({ createdAt: 1 })
            .lean();
    }

    public async findByIdWithCreator(
        id: Types.ObjectId,
    ): Promise<ISticker | null> {
        return await Sticker.findById(id)
            .populate('createdBy', 'username')
            .lean();
    }

    public async findByServerAndName(
        serverId: Types.ObjectId,
        name: string,
    ): Promise<ISticker | null> {
        return await Sticker.findOne({ serverId, name }).lean();
    }

    public async findByServerIds(
        serverIds: Types.ObjectId[],
    ): Promise<ISticker[]> {
        return await Sticker.find({ serverId: { $in: serverIds } })
            .select('_id name imageUrl isAnimated serverId createdBy createdAt')
            .sort({ name: 1 })
            .lean();
    }
}
