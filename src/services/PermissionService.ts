import { injectable, inject } from 'inversify';
import { TYPES } from '../di/types';
import { IServerRepository } from '../di/interfaces/IServerRepository';
import { IServerMemberRepository } from '../di/interfaces/IServerMemberRepository';
import { IRoleRepository } from '../di/interfaces/IRoleRepository';
import { ICategoryRepository } from '../di/interfaces/ICategoryRepository';
import { IChannelRepository } from '../di/interfaces/IChannelRepository';

/**
 * Permission Service
 *
 * Handles server permission checks and role hierarchy.
 * Refactored from serverPermissions.ts to use dependency injection.
 */
@injectable()
export class PermissionService {
    constructor(
        @inject(TYPES.ServerRepository) private serverRepo: IServerRepository,
        @inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @inject(TYPES.RoleRepository) private roleRepo: IRoleRepository,
        @inject(TYPES.CategoryRepository)
        private categoryRepo: ICategoryRepository,
        @inject(TYPES.ChannelRepository)
        private channelRepo: IChannelRepository,
    ) {}

    /**
     * Get user's highest role position in a server.
     *
     * @param serverId - The ID of the server to check
     * @param userId - The ID of the user to check
     *
     * @returns The highest role position of the user in the server, or -1 if the user is not a member
     *
     * Logic:
     * - Owner always has MAX_SAFE_INTEGER position
     * - Checks all roles assigned to the user
     * - Returns the highest position value found
     * - Returns -1 if user is not a member
     */
    async getHighestRolePosition(
        serverId: string,
        userId: string,
    ): Promise<number> {
        if (!serverId) return -1;

        const server = await this.serverRepo.findById(serverId);
        if (!server) return -1;

        // Owner has highest position
        if (server.ownerId.toString() === userId) {
            return Number.MAX_SAFE_INTEGER;
        }

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) return -1;

        const roles = await Promise.all(
            member.roles.map((roleId: any) =>
                this.roleRepo.findById(roleId.toString()),
            ),
        );
        const validRoles = roles.filter((r): r is any => r !== null);

        let highestPosition = -1;
        for (const role of validRoles) {
            if (role.position > highestPosition) {
                highestPosition = role.position;
            }
        }

        return highestPosition;
    }

    /**
     * Check if user has a specific permission in a server.
     *
     * @param serverId - The ID of the server to check
     * @param userId - The ID of the user to check
     * @param permission - The permission to check
     *
     * @returns true if permission is granted, false otherwise
     *
     * Hierarchy (highest to lowest priority):
     * 1. Server Owner (Always has all permissions)
     * 2. Administrator Role (Always has all permissions)
     * 3. Role Hierarchy (Higher position roles override lower ones)
     * 4. @everyone Role
     */
    async hasPermission(
        serverId: string,
        userId: string,
        permission: string,
    ): Promise<boolean> {
        if (!serverId) return false;

        const server = await this.serverRepo.findById(serverId);
        if (!server) return false;

        // Owner has all permissions
        if (server.ownerId.toString() === userId) {
            return true;
        }

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) return false;

        // Get all roles with their details
        const roles = await Promise.all(
            member.roles.map((roleId: any) =>
                this.roleRepo.findById(roleId.toString()),
            ),
        );
        const validRoles = roles.filter((r): r is any => r !== null);

        // Sort by position (highest first) - higher position = higher priority
        validRoles.sort((a, b) => b.position - a.position);

        // Check from highest position to lowest
        for (const role of validRoles) {
            // Administrator has all permissions
            if (role.permissions.administrator === true) {
                return true;
            }

            // Check if this role has the specific permission set
            const permValue = (role.permissions as any)[permission];
            if (permValue === false) return false; // Explicit deny from higher role
            if (permValue === true) return true; // Explicit allow from higher role
        }

        // Check @everyone role
        const everyoneRole = await this.roleRepo.findEveryoneRole(serverId);
        if (everyoneRole) {
            if (everyoneRole.permissions.administrator === true) return true;
            const permValue = (everyoneRole.permissions as any)[permission];
            if (permValue === true) return true;
        }

        return false;
    }

    /**
     * Check if user has a specific permission in a channel.
     *
     * @param serverId - The ID of the server to check
     * @param userId - The ID of the user to check
     * @param channelId - The ID of the channel to check
     * @param permission - The permission to check
     *
     * @returns true if permission is granted, false otherwise
     *
     * Hierarchy (highest to lowest priority):
     * 1. Server Owner
     * 2. Administrator Role
     * 3. Channel Overrides (Specific to channel)
     * 4. Category Overrides (Inherited from category)
     * 5. Role Permissions (Base server permissions)
     */
    async hasChannelPermission(
        serverId: string,
        userId: string,
        channelId: string,
        permission: string,
    ): Promise<boolean> {
        const server = await this.serverRepo.findById(serverId);
        if (!server) return false;

        // Owner has all permissions
        if (server.ownerId.toString() === userId) {
            return true;
        }

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) return false;

        // Get all roles with their details
        const roles = await Promise.all(
            member.roles.map((roleId: any) =>
                this.roleRepo.findById(roleId.toString()),
            ),
        );
        const validRoles = roles.filter((r): r is any => r !== null);

        // Sort by position (highest first) - higher position = higher priority
        validRoles.sort((a, b) => b.position - a.position);

        // Step 1: Check role permissions (base permissions)
        let rolePermissionValue: boolean | undefined;
        for (const role of validRoles) {
            // Administrator has all permissions
            if (role.permissions.administrator === true) {
                return true;
            }

            // Check if this role has the specific permission set
            const permValue = (role.permissions as any)[permission];
            if (permValue === false) {
                rolePermissionValue = false; // Explicit deny from higher role
                break;
            }
            if (permValue === true) {
                rolePermissionValue = true; // Explicit allow from higher role
                break;
            }
        }

        // Check @everyone role if no other role matched
        if (rolePermissionValue === undefined) {
            const everyoneRole = await this.roleRepo.findEveryoneRole(serverId);
            if (everyoneRole) {
                if (everyoneRole.permissions.administrator === true)
                    return true;
                const permValue = (everyoneRole.permissions as any)[permission];
                if (permValue === true) rolePermissionValue = true;
                else if (permValue === false) rolePermissionValue = false;
            }
        }

        // Step 2: Check category overrides (if any)
        const channel = await this.channelRepo.findById(channelId);
        if (!channel) return rolePermissionValue || false;

        let categoryPermissionValue: boolean | undefined;
        if ((channel as any).categoryId) {
            const category = await this.categoryRepo.findById(
                (channel as any).categoryId.toString(),
            );
            if (category?.permissions) {
                // Check category permissions for user's roles
                for (const role of validRoles) {
                    const roleId = role._id?.toString();
                    if (roleId && category.permissions[roleId]) {
                        const permValue = (category.permissions[roleId] as any)[
                            permission
                        ];
                        if (permValue === false) {
                            categoryPermissionValue = false;
                            break;
                        }
                        if (permValue === true) {
                            categoryPermissionValue = true;
                            break;
                        }
                    }
                }
            }
        }

        // Step 3: Check channel overrides (if any)
        let channelPermissionValue: boolean | undefined;
        if (channel.permissions) {
            // Check channel permissions for user's roles
            for (const role of validRoles) {
                const roleId = role._id?.toString();
                if (roleId && channel.permissions[roleId]) {
                    const permValue = (channel.permissions[roleId] as any)[
                        permission
                    ];
                    if (permValue === false) {
                        channelPermissionValue = false;
                        break;
                    }
                    if (permValue === true) {
                        channelPermissionValue = true;
                        break;
                    }
                }
            }
        }

        // Apply hierarchy: Channel overrides are most important, then category, then role
        // Channel > Category > Role
        if (channelPermissionValue !== undefined) {
            return channelPermissionValue;
        }
        if (categoryPermissionValue !== undefined) {
            return categoryPermissionValue;
        }
        if (rolePermissionValue !== undefined) {
            return rolePermissionValue;
        }

        // Default: deny if nothing explicitly set
        return false;
    }
}
