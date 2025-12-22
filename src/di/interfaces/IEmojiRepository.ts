import type { Types } from 'mongoose';

/**
 * Emoji interface.
 *
 * Represents a custom emoji uploaded to a server.
 */
export interface IEmoji {
    _id: any;
    name: string;
    imageUrl: string;
    serverId: Types.ObjectId | string;
    /**
     * The user who uploaded the emoji (userId)
     */
    createdBy: Types.ObjectId | string;
    createdAt?: Date;
}

/**
 * Emoji Repository Interface
 *
 * Encapsulates custom emoji operations
 */
export interface IEmojiRepository {
    /**
     * Find emoji by ID
     */
    findById(id: string): Promise<IEmoji | null>;

    /**
     * Find all emojis for a server
     */
    findByServerId(serverId: string): Promise<IEmoji[]>;

    /**
     * Create a new emoji
     */
    create(data: {
        name: string;
        imageUrl: string;
        serverId: string;
        createdBy: string;
    }): Promise<IEmoji>;

    /**
     * Delete emoji by ID
     */
    delete(id: string): Promise<boolean>;

    /**
     * Find all emojis for a server with creator info populated.
     */
    findByServerIdWithCreator(serverId: string): Promise<IEmoji[]>;

    /**
     * Find emoji by ID with creator info populated.
     */
    findByIdWithCreator(id: string): Promise<IEmoji | null>;

    /**
     * Find emoji by server and name
     */
    findByServerAndName(serverId: string, name: string): Promise<IEmoji | null>;

    /**
     * Find emojis by multiple server IDs
     */
    findByServerIds(serverIds: string[]): Promise<IEmoji[]>;
}
