import type {
    Category,
    Channel,
    PermissionKey,
    Permissions,
    ServerData,
    ServerMember,
    ServerRole,
} from '@/permissions/types';

function getPermissionValue(
    permissions: Permissions | undefined,
    permission: PermissionKey,
): boolean | undefined {
    return permissions?.[permission];
}

function mergeHighestRolePermission(
    rolesByAscPosition: readonly ServerRole[],
    permission: PermissionKey,
): boolean | undefined {
    // Process low -> high, where higher position overrides lower.
    let value: boolean | undefined;
    for (const role of rolesByAscPosition) {
        const v = getPermissionValue(role.permissions, permission);
        if (v !== undefined) value = v;
    }
    return value;
}

function applyOverridesForRoles(
    rolesByAscPosition: readonly ServerRole[],
    overrides: Map<string, Permissions> | undefined,
    permission: PermissionKey,
): boolean | undefined {
    if (!overrides) return undefined;

    // Process low -> high, where higher position overrides lower.
    let value: boolean | undefined;
    for (const role of rolesByAscPosition) {
        const roleOverride = overrides.get(role.id.toString());
        const v = getPermissionValue(roleOverride, permission);
        if (v !== undefined) value = v;
    }
    return value;
}

export class PermissionResolver {
    private readonly data: ServerData;

    private readonly roleById: Map<string, ServerRole>;
    private readonly channelById: Map<string, Channel>;
    private readonly categoryById: Map<string, Category>;
    private readonly memberByUserId: Map<string, ServerMember>;

    private readonly everyoneRoleId?: string;

    constructor(data: ServerData) {
        this.data = data;

        this.roleById = new Map(data.roles.map((r) => [r.id.toString(), r] as const));
        this.channelById = new Map(
            data.channels.map((c) => [c.id.toString(), c] as const),
        );
        this.categoryById = new Map(
            data.categories.map((c) => [c.id.toString(), c] as const),
        );
        this.memberByUserId = new Map(
            data.members.map((m) => [m.userId.toString(), m] as const),
        );

        this.everyoneRoleId = data.everyoneRoleId?.toString();
    }

    hasServerPermission(userId: string, permission: PermissionKey): boolean {
        // 1) Owner
        if (userId === this.data.ownerId.toString()) return true;

        const member = this.memberByUserId.get(userId);
        if (!member) return false;

        const rolesAsc = this.getMemberRolesByAscPosition(member);

        // Include @everyone as the lowest-priority role in base permission merging.
        const rolesAscWithEveryone = this.everyoneRoleId
            ? this.appendEveryoneRole(rolesAsc)
            : rolesAsc;

        // 2) Administrator bypass
        if (this.hasAdministrator(rolesAscWithEveryone)) return true;

        // 3) Role permissions (merged)
        const merged = mergeHighestRolePermission(
            rolesAscWithEveryone,
            permission,
        );
        return merged ?? false;
    }

    canUserDo(
        userId: string,
        channelId: string,
        permission: PermissionKey,
    ): boolean {
        const channel = this.channelById.get(channelId);
        if (!channel) return false;

        // 1) Owner
        if (userId === this.data.ownerId.toString()) return true;

        const member = this.memberByUserId.get(userId);
        if (!member) return false;

        const rolesAsc = this.getMemberRolesByAscPosition(member);

        // Include @everyone role for overrides if available.
        const rolesAscForOverrides = this.everyoneRoleId
            ? this.appendEveryoneRole(rolesAsc)
            : rolesAsc;

        // 2) Administrator bypass
        if (this.hasAdministrator(rolesAscForOverrides)) return true;

        // 3) Channel overrides
        const channelValue = applyOverridesForRoles(
            rolesAscForOverrides,
            channel.overrides,
            permission,
        );
        if (channelValue !== undefined) return channelValue;

        // 4) Category overrides
        const categoryId = channel.categoryId?.toString();
        if (categoryId) {
            const category = this.categoryById.get(categoryId);
            const categoryValue = applyOverridesForRoles(
                rolesAscForOverrides,
                category?.overrides,
                permission,
            );
            if (categoryValue !== undefined) return categoryValue;
        }

        // 5) Role permissions (merged)
        const merged = mergeHighestRolePermission(rolesAsc, permission);
        if (merged !== undefined) return merged;

        // 6) @everyone fallback
        const everyone = this.getEveryonePermission(permission);
        return everyone ?? false;
    }

    getHighestRolePosition(userId: string): number {
        if (userId === this.data.ownerId.toString()) return Number.MAX_SAFE_INTEGER;

        const member = this.memberByUserId.get(userId);
        if (!member) return -1;

        let highest = -1;
        for (const roleId of member.roleIds) {
            const role = this.roleById.get(roleId.toString());
            if (role && role.position > highest) highest = role.position;
        }
        return highest;
    }

    private getMemberRolesByAscPosition(member: ServerMember): ServerRole[] {
        const roles: ServerRole[] = [];
        for (const roleId of member.roleIds) {
            const role = this.roleById.get(roleId.toString());
            if (role) roles.push(role);
        }
        roles.sort((a, b) => a.position - b.position);
        return roles;
    }

    private hasAdministrator(
        rolesByAscPosition: readonly ServerRole[],
    ): boolean {
        for (const role of rolesByAscPosition) {
            if (role.permissions.administrator === true) return true;
        }
        return false;
    }

    private getEveryonePermission(
        permission: PermissionKey,
    ): boolean | undefined {
        if (!this.everyoneRoleId) return undefined;
        const role = this.roleById.get(this.everyoneRoleId);
        if (!role) return undefined;

        if (role.permissions.administrator === true) return true;
        return getPermissionValue(role.permissions, permission);
    }

    private appendEveryoneRole(
        rolesByAscPosition: readonly ServerRole[],
    ): ServerRole[] {
        if (!this.everyoneRoleId) return [...rolesByAscPosition];
        const everyone = this.roleById.get(this.everyoneRoleId);
        if (!everyone) return [...rolesByAscPosition];

        // Ensure it's included exactly once.
        const already = rolesByAscPosition.some((r) => r.id.toString() === everyone.id.toString());
        if (already) return [...rolesByAscPosition];

        const next = [...rolesByAscPosition, everyone];
        next.sort((a, b) => a.position - b.position);
        return next;
    }
}
