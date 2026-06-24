export interface MarkdownBlockadeRule {
    targetType: 'everyone' | 'role' | 'user';
    targetId: string;
    features: string[];
}

// Server interface (domain model)
//
// Represents a community or group workspace
export interface IServer {
    id: string;
    name: string;
    ownerId: string;
    icon?: string;
    description?: string;
    banner?: {
        type: 'image' | 'color' | 'gif';
        value: string;
    };
    defaultRoleId?: string;
    disableCustomFonts?: boolean;
    disableUsernameGlowAndCustomColor?: boolean;
    markdownBlockadeRules?: MarkdownBlockadeRule[];
    verified?: boolean;
    verificationScore?: number;
    verificationEligible?: boolean;
    verificationLastComputedAt?: Date;
    verificationFailureReasons?: string[];
    verificationOverride?: 'verified' | 'unverified' | null;
    verificationRequested?: boolean;
    discoveryEnabled?: boolean;
    onboarding?: {
        enabled: boolean;
        guidelines: string[];
        selfAssignableRoleIds: string[];
        landingChannelId?: string | null;
        welcomeChannelIds: string[];
    };
    createdAt?: Date;
    updatedAt?: Date;
    deletedAt?: Date;
    allTimeHigh?: number;
    memberCount?: number;
    tags?: string[];
}

// Server creation DTO
export interface CreateServerDTO {
    name: string;
    ownerId: string;
    icon?: string;
    description?: string;
    tags?: string[];
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
        id: RepositoryId,
        includeDeleted?: boolean,
    ): Promise<IServer | null>;

    // Find multiple servers by IDs
    findByIds(ids: RepositoryId[]): Promise<IServer[]>;

    // Find servers by owner ID
    findByOwnerId(ownerId: string): Promise<IServer[]>;

    // Create a new server
    create(data: CreateServerDTO): Promise<IServer>;

    // Update server
    update(id: RepositoryId, data: Partial<IServer>): Promise<IServer | null>;

    // Delete server (hard delete)
    delete(id: RepositoryId): Promise<boolean>;

    // Clear default role
    //
    // Used for cleanup when the default role is deleted
    clearDefaultRole(
        serverId: RepositoryId,
        roleId: RepositoryId,
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
    softDelete(id: RepositoryId): Promise<boolean>;

    // Restore soft-deleted server
    restore(id: RepositoryId): Promise<boolean>;

    // Count servers created after a certain date
    countCreatedAfter(date: Date): Promise<number>;

    // Count servers created per hour for the last N hours (oldest-first array)
    countByHour(since: Date, hours: number): Promise<number[]>;

    // Count servers created per day for the last N days (oldest-first array)
    countByDay(since: Date, days: number): Promise<number[]>;

    // Count all servers per day since the very first server (lifetime view)
    countAllByDay(): Promise<number[]>;
    listAwaitingReview(options: { limit: number; offset: number }): Promise<
        (IServer & {
            memberCount?: number;
            realMessageCount?: number;
            weightScore?: number;
        })[]
    >;
    countAwaitingReview(): Promise<number>;
}
import type { Types } from 'mongoose';

export type RepositoryId = string | Types.ObjectId;
