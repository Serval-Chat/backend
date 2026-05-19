import type { Types } from 'mongoose';
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
    communicationDisabledUntil?: Date | null;
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
