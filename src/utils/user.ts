import {
    resolveSerializedCustomStatus,
    type SerializedCustomStatus,
} from '@/utils/status';
import {
    type AdminPermissions,
    DEFAULT_PERMISSIONS,
} from '@/permissions/AdminPermissions';

export interface Badge {
    _id: string;
    id: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    createdAt: Date;
}

export interface ServerFolder {
    id: string;
    name: string;
    color: string;
    serverIds: string[];
}

export interface ServerSettings {
    order: (string | ServerFolder)[];
}
export interface DBUser {
    _id: { toString(): string };
    id?: string;
    username: string;
    displayName?: string | null;
    profilePicture?: string | null;
    isBot?: boolean;
    usernameFont?: string;
    usernameGradient?: { enabled: boolean; colors: string[]; angle: number };
    usernameGlow?: { enabled: boolean; color: string; intensity: number };
    customStatus?: {
        text: string;
        emoji?: string;
        expiresAt: Date | null;
        updatedAt: Date;
    } | null;
    createdAt: Date;
    bio?: string;
    pronouns?: string;
    badges?: string[] | Badge[];
    deletedAt?: Date | null;
    anonymizedUsername?: string | null;
    banner?: string | null;
    bannerColor?: string | null;
    settings?: {
        muteNotifications?: boolean;
        useDiscordStyleMessages?: boolean;
        ownMessagesAlign?: 'left' | 'right';
        otherMessagesAlign?: 'left' | 'right';
        showYouLabel?: boolean;
        ownMessageColor?: string;
        otherMessageColor?: string;
        disableCustomUsernameFonts?: boolean;
        disableCustomUsernameColors?: boolean;
        disableCustomUsernameGlow?: boolean;
    };
    totpEnabled?: boolean;
    serverSettings?: ServerSettings;
    permissions?: AdminPermissions;
}

export interface MappedUser {
    _id: string;
    id: string;
    username: string;
    displayName: string | null;
    profilePicture: string | null;
    isBot: boolean;
    usernameFont: string;
    usernameGradient: { enabled: boolean; colors: string[]; angle: number };
    usernameGlow: { enabled: boolean; color: string; intensity: number };
    customStatus: SerializedCustomStatus | null;
    createdAt: Date;
    bio: string;
    pronouns: string;
    badges: Badge[];
    deletedAt: Date | null;
    anonymizedUsername: string | null;
    banner: string | null;
    bannerColor?: string | null;
    permissions?: AdminPermissions;
    settings?: DBUser['settings'];
    totpEnabled?: boolean;
    serverSettings?: ServerSettings;
}

export interface MapUserOptions {
    includePermissions?: boolean;
    includeTotp?: boolean;
}

export function mapUser(user: DBUser, options?: MapUserOptions): MappedUser;
export function mapUser(
    user: unknown,
    options?: MapUserOptions,
): MappedUser | null;
export function mapUser(
    user: DBUser | unknown,
    options: MapUserOptions = {},
): MappedUser | null {
    if (user === undefined || user === null || typeof user !== 'object')
        return null;
    const u = user as DBUser;

    const profilePictureUrl = u.deletedAt
        ? '/images/deleted-cat.jpg'
        : u.profilePicture !== undefined && u.profilePicture !== ''
          ? `/api/v1/profile/picture/${u.profilePicture}`
          : null;

    const populatedBadges: Badge[] = Array.isArray(u.badges)
        ? u.badges.filter((b): b is Badge => typeof b === 'object' && 'id' in b)
        : [];

    return {
        _id: u._id.toString(),
        id: u._id.toString(),
        username: u.username,
        displayName: u.displayName ?? null,
        profilePicture: profilePictureUrl,
        isBot: u.isBot ?? false,
        usernameFont: u.usernameFont ?? 'default',
        usernameGradient: u.usernameGradient ?? {
            enabled: false,
            colors: ['#ffffff', '#ffffff'],
            angle: 90,
        },
        usernameGlow: u.usernameGlow ?? {
            enabled: false,
            color: '#ffffff',
            intensity: 5,
        },
        customStatus: resolveSerializedCustomStatus(
            u.customStatus as Record<string, unknown> | null | undefined,
        ),
        createdAt: u.createdAt,
        bio: u.bio ?? '',
        pronouns: u.pronouns ?? '',
        badges: populatedBadges,
        deletedAt: u.deletedAt ?? null,
        anonymizedUsername: u.anonymizedUsername ?? null,
        banner:
            u.banner !== undefined && u.banner !== ''
                ? `/api/v1/profile/banner/${u.banner}`
                : null,
        bannerColor: u.bannerColor ?? null,
        ...(options.includePermissions === true && {
            permissions: u.permissions ?? DEFAULT_PERMISSIONS,
        }),
        settings: u.settings,
        ...(options.includeTotp === true && {
            totpEnabled: u.totpEnabled ?? false,
        }),
        serverSettings: u.serverSettings,
    };
}
