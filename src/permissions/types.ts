import {
    getPermissionDefault,
    isPermissionKey,
    PERMISSION_KEYS,
    type PermissionKey,
} from '@/permissions/registry';

export {
    getPermissionDefault,
    isPermissionKey,
    PERMISSION_KEYS,
    type PermissionKey,
};

export type Permissions = Partial<Record<PermissionKey, boolean>>;

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
    communicationDisabledUntil?: Date | null;
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
