import type { Types } from 'mongoose';
import type { MappedUser } from '@/utils/user';

// Server Ban interface (domain model)
//
// Represents a user who has been banned from a specific server
export interface IServerBan {
    _id: Types.ObjectId;
    serverId: string;
    userId: string;
    // The administrator who issued the ban
    bannedBy: string;
    reason?: string;
    createdAt: Date;
}

// Server Ban creation DTO
export interface CreateServerBanDTO {
    serverId: string;
    userId: string;
    bannedBy: string;
    reason?: string;
}

// Server Ban Repository Interface
//
// Encapsulates server ban operations
export interface IServerBanRepository {
    // Find ban by server and user
    findByServerAndUser(
        serverId: string,
        userId: string,
    ): Promise<IServerBan | null>;

    // Find all bans for a server
    findByServerId(serverId: string): Promise<IServerBan[]>;

    // Find all bans for a server with user info populated
    findByServerIdWithUserInfo(
        serverId: string,
    ): Promise<(IServerBan & { user: MappedUser | null })[]>;

    // Create a new server ban
    create(data: CreateServerBanDTO): Promise<IServerBan>;

    // Delete ban by ID
    delete(id: Types.ObjectId): Promise<boolean>;

    // Delete all bans for a server (bulk delete)
    deleteByServerId(serverId: string): Promise<number>;

    // Unban user from server
    unban(serverId: string, userId: string): Promise<boolean>;
}
