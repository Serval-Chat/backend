import type { Types } from 'mongoose';

// Emoji interface
//
// Represents a custom emoji uploaded to a server
export interface IEmoji {
    _id: Types.ObjectId;
    name: string;
    imageUrl: string;
    serverId: Types.ObjectId;
    // The user who uploaded the emoji (userId)
    createdBy: Types.ObjectId;
    createdAt?: Date;
}

// Emoji Repository Interface
//
// Encapsulates custom emoji operations
export interface IEmojiRepository {
    // Find emoji by ID
    findById(id: Types.ObjectId): Promise<IEmoji | null>;

    // Find all emojis for a server
    findByServerId(serverId: Types.ObjectId): Promise<IEmoji[]>;

    // Create a new emoji
    create(data: {
        name: string;
        imageUrl: string;
        serverId: Types.ObjectId;
        createdBy: Types.ObjectId;
    }): Promise<IEmoji>;

    // Delete emoji by ID
    delete(id: Types.ObjectId): Promise<boolean>;

    // Find all emojis for a server with creator info populated
    findByServerIdWithCreator(serverId: Types.ObjectId): Promise<IEmoji[]>;

    // Find emoji by ID with creator info populated
    findByIdWithCreator(id: Types.ObjectId): Promise<IEmoji | null>;

    // Find emoji by server and name
    findByServerAndName(
        serverId: Types.ObjectId,
        name: string,
    ): Promise<IEmoji | null>;

    // Find emojis by multiple server IDs
    findByServerIds(serverIds: Types.ObjectId[]): Promise<IEmoji[]>;
}
