import type { Types } from 'mongoose';

// Server interface (domain model)
//
// Represents a community or group workspace
export interface IServer {
    _id: Types.ObjectId | string;
    name: string;
    ownerId: Types.ObjectId | string;
    icon?: string;
    banner?: {
        type: 'image' | 'gradient' | 'color' | 'gif';
        value: string;
    };
    // Default role assigned to new members (e.g., @everyone)
    defaultRoleId?: Types.ObjectId | string;
    createdAt?: Date;
    updatedAt?: Date;
    // Timestamp of when the server was soft-deleted
    deletedAt?: Date;
    // Historical peak of concurrent members
    allTimeHigh?: number;
    // Total number of members in the server
    memberCount?: number;
}

// Server creation DTO
export interface CreateServerDTO {
    name: string;
    ownerId: string;
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
    findById(id: string, includeDeleted?: boolean): Promise<IServer | null>;

    // Find multiple servers by IDs
    findByIds(ids: string[]): Promise<IServer[]>;

    // Find servers by owner ID
    findByOwnerId(ownerId: string): Promise<IServer[]>;

    // Create a new server
    create(data: CreateServerDTO): Promise<IServer>;

    // Update server
    update(id: string, data: Partial<IServer>): Promise<IServer | null>;

    // Delete server (hard delete)
    delete(id: string): Promise<boolean>;

    // Clear default role
    //
    // Used for cleanup when the default role is deleted
    clearDefaultRole(serverId: string, roleId: string): Promise<boolean>;

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
    softDelete(id: string): Promise<boolean>;

    // Restore soft-deleted server
    restore(id: string): Promise<boolean>;

    // Count servers created after a certain date
    countCreatedAfter(date: Date): Promise<number>;
}
