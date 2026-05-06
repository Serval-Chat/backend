import type { Types } from 'mongoose';

export interface ISticker {
    _id: Types.ObjectId;
    name: string;
    imageUrl: string;
    isAnimated: boolean;
    serverId: Types.ObjectId;
    createdBy: Types.ObjectId;
    createdAt?: Date;
}

export interface IStickerRepository {
    findById(id: Types.ObjectId): Promise<ISticker | null>;

    findByServerId(serverId: Types.ObjectId): Promise<ISticker[]>;
    create(data: {
        name: string;
        imageUrl: string;
        isAnimated: boolean;
        serverId: Types.ObjectId;
        createdBy: Types.ObjectId;
    }): Promise<ISticker>;

    delete(id: Types.ObjectId): Promise<boolean>;

    findByServerIdWithCreator(serverId: Types.ObjectId): Promise<ISticker[]>;

    findByIdWithCreator(id: Types.ObjectId): Promise<ISticker | null>;

    findByServerAndName(
        serverId: Types.ObjectId,
        name: string,
    ): Promise<ISticker | null>;
    findByServerIds(serverIds: Types.ObjectId[]): Promise<ISticker[]>;
}
