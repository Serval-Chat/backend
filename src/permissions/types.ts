export const PERMISSION_KEYS = [
    'sendMessages',
    'manageMessages',
    'deleteMessagesOfOthers',
    'manageChannels',
    'manageRoles',
    'banMembers',
    'kickMembers',
    'manageInvites',
    'manageServer',
    'administrator',
    'manageWebhooks',
    'pingRolesAndEveryone',
    'addReactions',
    'manageReactions',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type Permissions = Partial<Record<PermissionKey, boolean>>;

export function isPermissionKey(key: string): key is PermissionKey {
    return (PERMISSION_KEYS as readonly string[]).includes(key);
}

export interface ServerRole {
    id: string;
    serverId: string;
    name: string;
    position: number;
    permissions: Permissions;
}

export interface RoleOverride {
    roleId: string;
    permissions: Permissions;
}

export interface Channel {
    id: string;
    serverId: string;
    categoryId?: string | null;
    overrides?: Map<string, Permissions>;
}

export interface Category {
    id: string;
    serverId: string;
    overrides?: Map<string, Permissions>;
}

export interface ServerMember {
    id: string;
    serverId: string;
    userId: string;
    roleIds: string[];
}

export interface ServerData {
    serverId: string;
    ownerId: string;
    roles: ServerRole[];
    everyoneRoleId?: string;
    channels: Channel[];
    categories: Category[];
    members: ServerMember[];
}
