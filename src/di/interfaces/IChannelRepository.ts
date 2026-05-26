import type { Types, ClientSession } from 'mongoose';
import type { MarkdownBlockadeRule } from './IServerRepository';

// Channel interface
//
// Represents a text or voice communication channel within a server
export interface IChannel {
    _id: Types.ObjectId;
    serverId: Types.ObjectId;
    name: string;
    type: 'text' | 'voice' | 'link';
    position: number;
    categoryId?: Types.ObjectId | null;
    permissions?: {
        [roleId: string]: {
            sendMessages?: boolean;
            manageMessages?: boolean;
            deleteMessagesOfOthers?: boolean;
            pinMessages?: boolean;
            bypassMarkdownRestrictions?: boolean;
        };
    };
    markdownBlockadeRules?: MarkdownBlockadeRule[];
    createdAt: Date;
    lastMessageAt?: Date;
    lastExportAt?: Date;
    description?: string;
    icon?: string;
    emoji?: string;
    emojiType?: 'custom' | 'unicode';
    link?: string;
    slowMode?: number;
}

// Channel creation DTO
export interface CreateChannelDTO {
    serverId: Types.ObjectId;
    name: string;
    type: 'text' | 'voice' | 'link';
    position: number;
    categoryId?: Types.ObjectId | null;
    permissions?: {
        [roleId: string]: {
            sendMessages?: boolean;
            manageMessages?: boolean;
            deleteMessagesOfOthers?: boolean;
            pinMessages?: boolean;
            bypassMarkdownRestrictions?: boolean;
        };
    };
    markdownBlockadeRules?: MarkdownBlockadeRule[];
    description?: string;
    icon?: string;
    emoji?: string;
    emojiType?: 'custom' | 'unicode';
    link?: string;
    slowMode?: number;
}

// Channel Repository Interface
//
// Encapsulates channel operations
export interface IChannelRepository {
    // Find channel by ID
    findById(id: Types.ObjectId): Promise<IChannel | null>;

    // Find channel by ID and Server ID
    findByIdAndServer(
        id: Types.ObjectId,
        serverId: Types.ObjectId,
    ): Promise<IChannel | null>;

    // Find all channels for a server
    findByServerId(serverId: Types.ObjectId): Promise<IChannel[]>;

    // Find all channels for multiple servers
    findByServerIds(serverIds: Types.ObjectId[]): Promise<IChannel[]>;

    // Find channel with maximum position for a server
    findMaxPositionByServerId(
        serverId: Types.ObjectId,
    ): Promise<IChannel | null>;

    // Create a new channel
    create(data: CreateChannelDTO): Promise<IChannel>;

    // Update channel by ID
    update(
        id: Types.ObjectId,
        data: Partial<IChannel>,
    ): Promise<IChannel | null>;

    // Delete channel by ID
    delete(id: Types.ObjectId): Promise<boolean>;

    // Update channel position
    updatePosition(
        id: Types.ObjectId,
        position: number,
    ): Promise<IChannel | null>;

    // Update last message timestamp
    updateLastMessageAt(
        id: Types.ObjectId,
        date?: Date,
        session?: ClientSession,
    ): Promise<IChannel | null>;

    // Delete all channels for a server (bulk delete)
    deleteByServerId(serverId: Types.ObjectId): Promise<number>;

    // Update channels in a category (bulk update)
    updateChannelsInCategory(
        categoryId: Types.ObjectId,
        updates: Partial<IChannel>,
    ): Promise<boolean>;
}
