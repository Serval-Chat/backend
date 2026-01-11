import type { Types, ClientSession } from 'mongoose';

// Channel interface
//
// Represents a text or voice communication channel within a server
export interface IChannel {
    _id: Types.ObjectId | string;
    serverId: Types.ObjectId | string;
    name: string;
    type: 'text' | 'voice';
    position: number;
    // Optionally parent category ID
    categoryId?: string | null;
    // Role-based permission overrides specific to this channel
    permissions?: {
        [roleId: string]: {
            sendMessages?: boolean;
            manageMessages?: boolean;
            deleteMessagesOfOthers?: boolean;
        };
    };
    createdAt: Date;
    // Timestamp of the last message sent in this channel
    // Used for unread tracking and channel sorting
    lastMessageAt?: Date;
    icon?: string;
    description?: string;
}

// Channel creation DTO
export interface CreateChannelDTO {
    serverId: string;
    name: string;
    type: 'text' | 'voice';
    position: number;
    categoryId?: string | null;
    permissions?: {
        [roleId: string]: {
            sendMessages?: boolean;
            manageMessages?: boolean;
            deleteMessagesOfOthers?: boolean;
        };
    };
    description?: string;
}

// Channel Repository Interface
//
// Encapsulates channel operations
export interface IChannelRepository {
    // Find channel by ID
    findById(id: string): Promise<IChannel | null>;

    // Find channel by ID and Server ID
    findByIdAndServer(id: string, serverId: string): Promise<IChannel | null>;

    // Find all channels for a server
    findByServerId(serverId: string): Promise<IChannel[]>;

    // Find all channels for multiple servers
    findByServerIds(serverIds: string[]): Promise<IChannel[]>;

    // Find channel with maximum position for a server
    findMaxPositionByServerId(serverId: string): Promise<IChannel | null>;

    // Create a new channel
    create(data: CreateChannelDTO): Promise<IChannel>;

    // Update channel by ID
    update(id: string, data: Partial<IChannel>): Promise<IChannel | null>;

    // Delete channel by ID
    delete(id: string): Promise<boolean>;

    // Update channel position
    updatePosition(id: string, position: number): Promise<IChannel | null>;

    // Update last message timestamp
    updateLastMessageAt(
        id: string,
        date?: Date,
        session?: ClientSession,
    ): Promise<IChannel | null>;

    // Delete all channels for a server (bulk delete)
    deleteByServerId(serverId: string): Promise<number>;

    // Update channels in a category (bulk update)
    updateChannelsInCategory(
        categoryId: string,
        updates: Partial<IChannel>,
    ): Promise<boolean>;
}
