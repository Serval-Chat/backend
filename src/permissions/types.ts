import type { Types } from 'mongoose';

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
    id: Types.ObjectId;
    serverId: Types.ObjectId;
    name: string;
    position: number;
    permissions: Permissions;
}

export interface RoleOverride {
    roleId: Types.ObjectId;
    permissions: Permissions;
}

export interface Channel {
    id: Types.ObjectId;
    serverId: Types.ObjectId;
    categoryId?: Types.ObjectId | null;
    overrides?: Map<string, Permissions>;
}

export interface Category {
    id: Types.ObjectId;
    serverId: Types.ObjectId;
    overrides?: Map<string, Permissions>;
}

export interface ServerMember {
    id: Types.ObjectId;
    serverId: Types.ObjectId;
    userId: Types.ObjectId;
    roleIds: Types.ObjectId[];
}

export interface ServerData {
    serverId: Types.ObjectId;
    ownerId: Types.ObjectId;
    roles: ServerRole[];
    everyoneRoleId?: Types.ObjectId;
    channels: Channel[];
    categories: Category[];
    members: ServerMember[];
}
