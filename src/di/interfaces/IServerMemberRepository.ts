import type { Types } from 'mongoose';

/**
 * Server Member interface/
 *
 * Represents a user's membership in a server, including their roles.
 */
export interface IServerMember {
    _id: any;
    serverId: Types.ObjectId | string;
    userId: Types.ObjectId | string;
    /**
     * List of role IDs assigned to the member.
     */
    roles: (Types.ObjectId | string)[];
    /**
     * Timestamp of when the user joined the server.
     */
    joinedAt?: Date;
}

/**
 * Server Member Repository Interface
 *
 * Encapsulates server member operations
 */
export interface IServerMemberRepository {
    /**
     * Find member by server and user ID
     */
    findByServerAndUser(
        serverId: string,
        userId: string,
    ): Promise<IServerMember | null>;

    /**
     * Find all members of a server
     */
    findByServerId(serverId: string): Promise<IServerMember[]>;

    /**
     * Create a new server member
     */
    create(data: {
        serverId: string;
        userId: string;
        roles: string[];
    }): Promise<IServerMember>;

    /**
     * Update member roles
     */
    updateRoles(
        serverId: string,
        userId: string,
        roles: string[],
    ): Promise<IServerMember | null>;

    /**
     * Remove member from server.
     */
    remove(serverId: string, userId: string): Promise<boolean>;

    /**
     * Check if user is member of server
     */
    isMember(serverId: string, userId: string): Promise<boolean>;

    /**
     * Find all server memberships for a user
     */
    findAllByUserId(userId: string): Promise<IServerMember[]>;

    /**
     * Find server memberships for a user (alias for findAllByUserId)
     */
    findByUserId(userId: string): Promise<IServerMember[]>;

    /**
     * Find all server IDs for a user
     */
    findServerIdsByUserId(userId: string): Promise<string[]>;

    /**
     * Count members by server ID
     */
    countByServerId(serverId: string): Promise<number>;

    /**
     * Delete server member by ID.
     */
    deleteById(memberId: string): Promise<boolean>;

    /**
     * Delete member by server ID (cleanup)
     */
    deleteByServerId(serverId: string): Promise<void>;

    /**
     * Remove a role from all members in a server.
     */
    removeRoleFromAllMembers(serverId: string, roleId: string): Promise<void>;

    /**
     * Remove a role from a specific member
     */
    removeRoleFromMember(
        memberId: string,
        roleId: string,
    ): Promise<IServerMember | null>;

    /**
     * Delete all server memberships for a user (for hard delete)
     */
    deleteAllForUser(userId: string): Promise<{ deletedCount: number }>;

    /**
     * Find all members of a server with user info populated
     */
    findByServerIdWithUserInfo(serverId: string): Promise<any[]>;

    /**
     * Search for members in a server
     */
    searchMembers(serverId: string, query: string): Promise<any[]>;

    /**
     * Add a role to a member
     */
    addRole(
        serverId: string,
        userId: string,
        roleId: string,
    ): Promise<IServerMember>;

    /**
     * Remove a role from a member
     */
    removeRole(
        serverId: string,
        userId: string,
        roleId: string,
    ): Promise<IServerMember>;

    /**
     * Remove a role from all members in a server (cleanup)
     */
    removeRoleFromAll(serverId: string, roleId: string): Promise<void>;
}
