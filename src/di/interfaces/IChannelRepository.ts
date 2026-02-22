import type { Types, ClientSession } from 'mongoose';

// Channel interface
//
// Represents a text or voice communication channel within a server
export interface IChannel {
    _id: Types.ObjectId;
    serverId: Types.ObjectId;
    name: string;
    type: 'text' | 'voice';
    position: number;
    // Optionally parent category ID
    categoryId?: Types.ObjectId | null;
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
    serverId: Types.ObjectId;
    name: string;
    type: 'text' | 'voice';
    position: number;
    categoryId?: Types.ObjectId | null;
    permissions?: {
        [roleId: string]: {
            sendMessages?: boolean;
            manageMessages?: boolean;
            deleteMessagesOfOthers?: boolean;
        };
    };
    description?: string;
    icon?: string;
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
    findMaxPositionByServerId(serverId: Types.ObjectId): Promise<IChannel | null>;

    // Create a new channel
    create(data: CreateChannelDTO): Promise<IChannel>;

    // Update channel by ID
    update(id: Types.ObjectId, data: Partial<IChannel>): Promise<IChannel | null>;

    // Delete channel by ID
    delete(id: Types.ObjectId): Promise<boolean>;

    // Update channel position
    updatePosition(id: Types.ObjectId, position: number): Promise<IChannel | null>;

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
