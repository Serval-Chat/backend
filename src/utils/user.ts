import {
    resolveSerializedCustomStatus,
    type SerializedCustomStatus,
} from '@/utils/status';
import { type AdminPermissions } from '@/routes/api/v1/admin/permissions';

export interface MappedUser {
    _id: string;
    id: string;
    login: string;
    username: string;
    displayName: string | null;
    profilePicture: string | null;
    usernameFont: string;
    usernameGradient: {
        enabled: boolean;
        colors: string[];
        angle: number;
    };
    usernameGlow: {
        enabled: boolean;
        color: string;
        intensity: number;
    };
    customStatus: SerializedCustomStatus | null;
    permissions: AdminPermissions;
    tokenVersion: number;
    createdAt: Date;
    bio: string;
    pronouns: string;
    badges: (string | unknown)[];
    deletedAt: Date | null;
    anonymizedUsername: string | null;
    banner: string | null;
}

// Maps a raw user object from the database to a public user object
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapUser(user: any): MappedUser | null {
    if (!user) return null;

    const profilePictureUrl = user.deletedAt
        ? '/images/deleted-cat.jpg'
        : user.profilePicture
          ? `/api/v1/profile/picture/${user.profilePicture}`
          : null;

    return {
        _id: (user._id?.toString() || user.id) as string,
        id: (user._id?.toString() || user.id) as string,
        login: (user.login as string) || '',
        username: user.username as string,
        displayName: (user.displayName as string) || null,
        profilePicture: profilePictureUrl,
        usernameFont: (user.usernameFont as string) || 'default',
        usernameGradient:
            (user.usernameGradient as MappedUser['usernameGradient']) || {
                enabled: false,
                colors: ['#ffffff', '#ffffff'],
                angle: 90,
            },
        usernameGlow: (user.usernameGlow as MappedUser['usernameGlow']) || {
            enabled: false,
            color: '#ffffff',
            intensity: 5,
        },
        customStatus: resolveSerializedCustomStatus(
            user.customStatus as Record<string, unknown> | null | undefined,
        ),
        permissions: (user.permissions as AdminPermissions) || {
            adminAccess: false,
            viewUsers: false,
            manageUsers: false,
            manageBadges: false,
            banUsers: false,
            viewBans: false,
            warnUsers: false,
            viewLogs: false,
            manageServer: false,
            manageInvites: false,
        },
        tokenVersion: (user.tokenVersion as number) || 0,
        createdAt: (user.createdAt as Date) || new Date(),
        bio: (user.bio as string) || '',
        pronouns: (user.pronouns as string) || '',
        badges: (user.badges as string[]) || [],
        deletedAt: (user.deletedAt as Date) || null,
        anonymizedUsername: (user.anonymizedUsername as string) || null,
        banner: user.banner ? `/api/v1/profile/picture/${user.banner}` : null,
    };
}
