import type {
    Category,
    Channel,
    PermissionKey,
    Permissions,
    ServerData,
    ServerMember,
    ServerRole,
} from '@/permissions/types';
import type { ILogger } from '@/di/interfaces/ILogger';

function getPermissionValue(
    permissions: Permissions | undefined,
    permission: PermissionKey,
): boolean | undefined {
    return permissions?.[permission];
}

function getPermissionDefault(permission: PermissionKey): boolean {
    switch (permission) {
        case 'viewChannels':
        case 'sendMessages':
        case 'addReactions':
            return true;
        case 'manageMessages':
        case 'deleteMessagesOfOthers':
        case 'manageChannels':
        case 'manageRoles':
        case 'banMembers':
        case 'kickMembers':
        case 'manageInvites':
        case 'manageServer':
        case 'administrator':
        case 'manageWebhooks':
        case 'pingRolesAndEveryone':
        case 'manageReactions':
        case 'export_channel_messages':
        case 'bypassSlowmode':
        case 'pinMessages':
        case 'seeDeletedMessages':
        case 'moderateMembers':
        case 'manageStickers':
            return false;
        default:
            return false;
    }
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
    private readonly logger?: ILogger;

    public constructor(data: ServerData, logger?: ILogger) {
        this.data = data;
        this.logger = logger;

        this.roleById = new Map(
            data.roles.map((r) => [r.id.toString(), r] as const),
        );
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

    public hasServerPermission(userId: string, permission: PermissionKey): boolean {
        // 1) Owner
        if (userId === this.data.ownerId.toString()) {
            this.logger?.debug(
                `[PermissionResolver] User ${userId} is the OWNER of server ${this.data.serverId}. Bypassing server permission check for '${permission}'.`,
            );
            return true;
        }

        const member = this.memberByUserId.get(userId);
        if (!member) return false;

        const rolesAsc = this.getMemberRolesByAscPosition(member);

        // Include @everyone as the lowest-priority role in base permission merging.
        const rolesAscWithEveryone = (this.everyoneRoleId !== undefined && this.everyoneRoleId !== '')
            ? this.appendEveryoneRole(rolesAsc)
            : rolesAsc;

        // 2) Administrator bypass
        if (this.hasAdministrator(rolesAscWithEveryone)) return true;

        // 3) Role permissions (merged)
        const merged = mergeHighestRolePermission(
            rolesAscWithEveryone,
            permission,
        );
        return merged ?? getPermissionDefault(permission);
    }

    public canUserDo(
        userId: string,
        channelId: string,
        permission: PermissionKey,
    ): boolean {
        const channel = this.channelById.get(channelId);
        if (!channel) return false;

        // 1) Owner
        if (userId === this.data.ownerId.toString())
            return true;

        const member = this.memberByUserId.get(userId);
        if (!member) return false;

        if (
            (permission === 'sendMessages' || permission === 'addReactions') &&
            member.communicationDisabledUntil &&
            new Date(member.communicationDisabledUntil) > new Date()
        ) {
            return false;
        }

        const rolesAsc = this.getMemberRolesByAscPosition(member);

        // Include @everyone role for overrides if available.
        const rolesAscForOverrides = (this.everyoneRoleId !== undefined && this.everyoneRoleId !== '')
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
        if (categoryId !== undefined && categoryId !== '') {
            const category = this.categoryById.get(categoryId);
            const categoryValue = applyOverridesForRoles(
                rolesAscForOverrides,
                category?.overrides,
                permission,
            );
            if (categoryValue !== undefined) return categoryValue;
        }

        // 5) Role permissions (merged)
        const merged = mergeHighestRolePermission(
            rolesAscForOverrides,
            permission,
        );
        return merged ?? getPermissionDefault(permission);
    }

    public canUserDoMultiple(
        userId: string,
        channelIds: string[],
        permission: PermissionKey,
    ): Map<string, boolean> {
        const results = new Map<string, boolean>();
        if (userId === this.data.ownerId.toString()) {
            for (const id of channelIds) results.set(id, true);
            return results;
        }

        const member = this.memberByUserId.get(userId);
        if (!member) {
            for (const id of channelIds) results.set(id, false);
            return results;
        }

        if (
            (permission === 'sendMessages' || permission === 'addReactions') &&
            member.communicationDisabledUntil &&
            new Date(member.communicationDisabledUntil) > new Date()
        ) {
            for (const id of channelIds) results.set(id, false);
            return results;
        }

        const rolesAsc = this.getMemberRolesByAscPosition(member);
        const rolesAscForOverrides = (this.everyoneRoleId !== undefined && this.everyoneRoleId !== '')
            ? this.appendEveryoneRole(rolesAsc)
            : rolesAsc;

        const isAdmin = this.hasAdministrator(rolesAscForOverrides);

        for (const channelId of channelIds) {
            if (isAdmin) {
                results.set(channelId, true);
                continue;
            }

            const channel = this.channelById.get(channelId);
            if (!channel) {
                results.set(channelId, false);
                continue;
            }

            // 3) Channel overrides
            const channelValue = applyOverridesForRoles(
                rolesAscForOverrides,
                channel.overrides,
                permission,
            );
            if (channelValue !== undefined) {
                results.set(channelId, channelValue);
                continue;
            }

            // 4) Category overrides
            const categoryId = channel.categoryId?.toString();
            if (categoryId !== undefined && categoryId !== '') {
                const category = this.categoryById.get(categoryId);
                const categoryValue = applyOverridesForRoles(
                    rolesAscForOverrides,
                    category?.overrides,
                    permission,
                );
                if (categoryValue !== undefined) {
                    results.set(channelId, categoryValue);
                    continue;
                }
            }

            // 5) Role permissions (merged)
            const roleMerged = mergeHighestRolePermission(
                rolesAscForOverrides,
                permission,
            );
            results.set(
                channelId,
                roleMerged ?? getPermissionDefault(permission),
            );
        }

        return results;
    }

    public getHighestRolePosition(userId: string): number {
        if (userId === this.data.ownerId.toString())
            return Number.MAX_SAFE_INTEGER;

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
        if (this.everyoneRoleId === undefined || this.everyoneRoleId === '') return undefined;
        const role = this.roleById.get(this.everyoneRoleId);
        if (!role) return undefined;

        if (role.permissions.administrator === true) return true;
        return getPermissionValue(role.permissions, permission);
    }

    private appendEveryoneRole(
        rolesByAscPosition: readonly ServerRole[],
    ): ServerRole[] {
        if (this.everyoneRoleId === undefined || this.everyoneRoleId === '') return [...rolesByAscPosition];
        const everyone = this.roleById.get(this.everyoneRoleId);
        if (!everyone) return [...rolesByAscPosition];

        // Ensure it's included exactly once.
        const already = rolesByAscPosition.some(
            (r) => r.id.toString() === everyone.id.toString(),
        );
        if (already) return [...rolesByAscPosition];

        const next = [...rolesByAscPosition, everyone];
        next.sort((a, b) => a.position - b.position);
        return next;
    }
}
