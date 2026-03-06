import type { Types } from 'mongoose';

// Server interface (domain model)
//
// Represents a community or group workspace
export interface IServer {
    _id: Types.ObjectId;
    name: string;
    ownerId: Types.ObjectId;
    icon?: string;
    banner?: {
        type: 'image' | 'gradient' | 'color' | 'gif';
        value: string;
    };
    defaultRoleId?: Types.ObjectId;
    disableCustomFonts?: boolean;
    disableUsernameGlowAndCustomColor?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
    deletedAt?: Date;
    allTimeHigh?: number;
    memberCount?: number;
}

// Server creation DTO
export interface CreateServerDTO {
    name: string;
    ownerId: Types.ObjectId;
    icon?: string;
}

// Server Repository Interface
//
// Encapsulates all server-related database operations
export interface IServerRepository {
    // Find server by ID
    //
    // @param id - Server ID
    // @param includeDeleted - Whether to include soft-deleted servers
    findById(
        id: Types.ObjectId,
        includeDeleted?: boolean,
    ): Promise<IServer | null>;

    // Find multiple servers by IDs
    findByIds(ids: Types.ObjectId[]): Promise<IServer[]>;

    // Find servers by owner ID
    findByOwnerId(ownerId: Types.ObjectId): Promise<IServer[]>;

    // Create a new server
    create(data: CreateServerDTO): Promise<IServer>;

    // Update server
    update(id: Types.ObjectId, data: Partial<IServer>): Promise<IServer | null>;

    // Delete server (hard delete)
    delete(id: Types.ObjectId): Promise<boolean>;

    // Clear default role
    //
    // Used for cleanup when the default role is deleted
    clearDefaultRole(
        serverId: Types.ObjectId,
        roleId: Types.ObjectId,
    ): Promise<boolean>;

    // Find many servers with pagination and search
    findMany(options: {
        limit: number;
        offset: number;
        search?: string;
        includeDeleted?: boolean;
    }): Promise<IServer[]>;

    // Count total servers
    count(includeDeleted?: boolean): Promise<number>;

    // Soft delete server
    softDelete(id: Types.ObjectId): Promise<boolean>;

    // Restore soft-deleted server
    restore(id: Types.ObjectId): Promise<boolean>;

    // Count servers created after a certain date
    countCreatedAfter(date: Date): Promise<number>;
}
