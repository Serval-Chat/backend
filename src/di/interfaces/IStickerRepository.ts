import type { Types } from 'mongoose';

export interface ISticker {
    _id: Types.ObjectId;
    snowflakeId: string;
    name: string;
    imageUrl: string;
    isAnimated: boolean;
    serverId: string;
    createdBy: string;
    createdAt?: Date;
}

export interface IStickerRepository {
    findById(id: string): Promise<ISticker | null>;

    findByServerId(serverId: string): Promise<ISticker[]>;
    create(data: {
        name: string;
        imageUrl: string;
        isAnimated: boolean;
        serverId: string;
        createdBy: string;
    }): Promise<ISticker>;

    delete(id: string): Promise<boolean>;

    findByServerIdWithCreator(serverId: string): Promise<ISticker[]>;

    findByIdWithCreator(id: string): Promise<ISticker | null>;

    findByServerAndName(
        serverId: string,
        name: string,
    ): Promise<ISticker | null>;
    findByServerIds(serverIds: string[]): Promise<ISticker[]>;
}
