import type { Types } from 'mongoose';

// Category interface
//
// Categories group channels together and can provide default permission
// Overrides for all channels within them
export interface ICategory {
    _id: Types.ObjectId | string;
    serverId: Types.ObjectId | string;
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
    serverId: string;
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
    findById(id: string): Promise<ICategory | null>;

    // Find category by ID and Server ID
    findByIdAndServer(id: string, serverId: string): Promise<ICategory | null>;

    // Find all categories for a server
    findByServerId(serverId: string): Promise<ICategory[]>;

    // Find category with maximum position for a server
    findMaxPositionByServerId(serverId: string): Promise<ICategory | null>;

    // Create a new category
    create(data: CreateCategoryDTO): Promise<ICategory>;

    // Update category by ID
    update(id: string, data: Partial<ICategory>): Promise<ICategory | null>;

    // Delete category by ID
    delete(id: string): Promise<boolean>;

    // Update category position
    updatePosition(id: string, position: number): Promise<ICategory | null>;

    // Delete all categories for a server (bulk delete)
    deleteByServerId(serverId: string): Promise<number>;

    // Update category positions (bulk reorder)
    updatePositions(
        updates: { id: string; position: number }[],
    ): Promise<boolean>;
}
