import type { Types } from 'mongoose';
import { type MappedUser } from '@/utils/user';

// Server Member interface
//
// Represents a user's membership in a server, including their roles
export interface IServerMember {
    _id: Types.ObjectId;
    serverId: Types.ObjectId;
    userId: Types.ObjectId;
    // List of role IDs assigned to the member
    roles: Types.ObjectId[];
    // Timestamp of when the user joined the server
    joinedAt?: Date;
}

// Server Member Repository Interface
//
// Encapsulates server member operations
export interface IServerMemberRepository {
    // Find member by server and user ID
    findByServerAndUser(
        serverId: Types.ObjectId,
        userId: Types.ObjectId,
    ): Promise<IServerMember | null>;

    // Find all members of a server
    findByServerId(serverId: Types.ObjectId): Promise<IServerMember[]>;

    // Create a new server member
    create(data: {
        serverId: Types.ObjectId;
        userId: Types.ObjectId;
        roles: Types.ObjectId[];
    }): Promise<IServerMember>;

    // Update member roles
    updateRoles(
        serverId: Types.ObjectId,
        userId: Types.ObjectId,
        roles: Types.ObjectId[],
    ): Promise<IServerMember | null>;

    // Remove member from server
    remove(serverId: Types.ObjectId, userId: Types.ObjectId): Promise<boolean>;

    // Check if user is member of server
    isMember(serverId: Types.ObjectId, userId: Types.ObjectId): Promise<boolean>;

    // Find all server memberships for a user
    findAllByUserId(userId: Types.ObjectId): Promise<IServerMember[]>;

    // Find server memberships for a user (alias for findAllByUserId)
    findByUserId(userId: Types.ObjectId): Promise<IServerMember[]>;

    // Find all server IDs for a user
    findServerIdsByUserId(userId: Types.ObjectId): Promise<Types.ObjectId[]>;

    // Find all user IDs that are members of any of the given servers
    findUserIdsInServerIds(serverIds: Types.ObjectId[]): Promise<Types.ObjectId[]>;

    // Count members by server ID
    countByServerId(serverId: Types.ObjectId): Promise<number>;

    // Delete server member by ID
    deleteById(memberId: Types.ObjectId): Promise<boolean>;

    // Delete member by server ID (cleanup)
    deleteByServerId(serverId: Types.ObjectId): Promise<void>;

    // Remove a role from all members in a server
    removeRoleFromAllMembers(
        serverId: Types.ObjectId,
        roleId: Types.ObjectId,
    ): Promise<void>;

    // Remove a role from a specific member
    removeRoleFromMember(
        memberId: Types.ObjectId,
        roleId: Types.ObjectId,
    ): Promise<IServerMember | null>;

    // Delete all server memberships for a user (for hard delete)
    deleteAllForUser(userId: Types.ObjectId): Promise<{ deletedCount: number }>;

    // Find all members of a server with user info populated
    findByServerIdWithUserInfo(
        serverId: Types.ObjectId,
    ): Promise<(IServerMember & { user: MappedUser | null })[]>;

    // Search for members in a server
    searchMembers(
        serverId: Types.ObjectId,
        query: string,
    ): Promise<(IServerMember & { user: MappedUser | null })[]>;

    // Add a role to a member
    addRole(
        serverId: Types.ObjectId,
        userId: Types.ObjectId,
        roleId: Types.ObjectId,
    ): Promise<IServerMember>;

    // Remove a role from a member
    removeRole(
        serverId: Types.ObjectId,
        userId: Types.ObjectId,
        roleId: Types.ObjectId,
    ): Promise<IServerMember>;

    // Remove a role from all members in a server (cleanup)
    removeRoleFromAll(
        serverId: Types.ObjectId,
        roleId: Types.ObjectId,
    ): Promise<void>;
}
