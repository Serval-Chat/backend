import { AdminPermissions } from './common';

export interface AdminUserListItemDTO {
    _id: string;
    username: string;
    login: string;
    displayName: string | null;
    profilePicture: string | null;
    permissions: string | AdminPermissions;
    createdAt: Date;
    banExpiry?: Date;
    warningCount: number;
}

export interface AdminUserDetailsDTO extends AdminUserListItemDTO {
    bio: string;
    pronouns: string;
    badges: any[];
    banner: string | null;
    deletedAt?: Date;
    deletedReason?: string;
}

export interface AdminExtendedUserDetailsDTO extends AdminUserDetailsDTO {
    servers: Array<{
        _id: string;
        name: string;
        icon: string | null;
        ownerId: string;
        joinedAt?: Date;
        isOwner: boolean;
        memberCount: number;
    }>;
}
