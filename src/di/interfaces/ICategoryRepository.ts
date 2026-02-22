import type { Types } from 'mongoose';

// Category interface
//
// Categories group channels together and can provide default permission
// Overrides for all channels within them
export interface ICategory {
    _id: Types.ObjectId;
    serverId: Types.ObjectId;
    name: string;
    position: number;
    // Role-based permission overrides for the category
    permissions?: {
        [roleId: string]: {
            sendMessages?: boolean;
            manageMessages?: boolean;
            deleteMessagesOfOthers?: boolean;
            manageChannels?: boolean;
            manageRoles?: boolean;
            banMembers?: boolean;
            kickMembers?: boolean;
            manageInvites?: boolean;
            manageServer?: boolean;
            administrator?: boolean;
        };
    };
    createdAt: Date;
}

// Category creation DTO
export interface CreateCategoryDTO {
    serverId: Types.ObjectId;
    name: string;
    position: number;
    permissions?: {
        [roleId: string]: {
            sendMessages?: boolean;
            manageMessages?: boolean;
            deleteMessagesOfOthers?: boolean;
            manageChannels?: boolean;
            manageRoles?: boolean;
            banMembers?: boolean;
            kickMembers?: boolean;
            manageInvites?: boolean;
            manageServer?: boolean;
            administrator?: boolean;
        };
    };
}

// Category Repository Interface
//
// Encapsulates category operations
export interface ICategoryRepository {
    // Find category by ID
    findById(id: Types.ObjectId): Promise<ICategory | null>;

    // Find category by ID and Server ID
    findByIdAndServer(
        id: Types.ObjectId,
        serverId: Types.ObjectId,
    ): Promise<ICategory | null>;

    // Find all categories for a server
    findByServerId(serverId: Types.ObjectId): Promise<ICategory[]>;

    // Find category with maximum position for a server
    findMaxPositionByServerId(
        serverId: Types.ObjectId,
    ): Promise<ICategory | null>;

    // Create a new category
    create(data: CreateCategoryDTO): Promise<ICategory>;

    // Update category by ID
    update(
        id: Types.ObjectId,
        data: Partial<ICategory>,
    ): Promise<ICategory | null>;

    // Delete category by ID
    delete(id: Types.ObjectId): Promise<boolean>;

    // Update category position
    updatePosition(
        id: Types.ObjectId,
        position: number,
    ): Promise<ICategory | null>;

    // Delete all categories for a server (bulk delete)
    deleteByServerId(serverId: Types.ObjectId): Promise<number>;

    // Update category positions (bulk reorder)
    updatePositions(
        updates: { id: Types.ObjectId; position: number }[],
    ): Promise<boolean>;
}
