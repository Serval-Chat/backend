import {
    resolveSerializedCustomStatus,
    type SerializedCustomStatus,
} from '@/utils/status';

export interface MappedUser {
    _id: string;
    id: string;
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
    createdAt: Date;
    bio: string;
    pronouns: string;
    badges: (string | unknown)[];
    deletedAt: Date | null;
    anonymizedUsername: string | null;
    banner: string | null;
}

interface RawUser {
    _id?: { toString(): string } | string;
    id?: string;
    username?: unknown;
    displayName?: unknown;
    profilePicture?: unknown;
    usernameFont?: unknown;
    usernameGradient?: unknown;
    usernameGlow?: unknown;
    customStatus?: unknown;
    createdAt?: unknown;
    bio?: unknown;
    pronouns?: unknown;
    badges?: unknown;
    deletedAt?: unknown;
    anonymizedUsername?: unknown;
    banner?: unknown;
    [key: string]: unknown;
}

// Maps a raw user object from the database to a public user object
export function mapUser(user: RawUser | null | undefined | unknown): MappedUser | null {
    if (!user || typeof user !== 'object') return null;
    const u = user as RawUser;

    const profilePictureUrl = u.deletedAt
        ? '/images/deleted-cat.jpg'
        : u.profilePicture
            ? `/api/v1/profile/picture/${u.profilePicture}`
            : null;

    return {
        _id: (u._id?.toString() || u.id) as string,
        id: (u._id?.toString() || u.id) as string,
        username: u.username as string,
        displayName: (u.displayName as string) || null,
        profilePicture: profilePictureUrl,
        usernameFont: (u.usernameFont as string) || 'default',
        usernameGradient:
            (u.usernameGradient as MappedUser['usernameGradient']) || {
                enabled: false,
                colors: ['#ffffff', '#ffffff'],
                angle: 90,
            },
        usernameGlow: (u.usernameGlow as MappedUser['usernameGlow']) || {
            enabled: false,
            color: '#ffffff',
            intensity: 5,
        },
        customStatus: resolveSerializedCustomStatus(
            u.customStatus as Record<string, unknown> | null | undefined,
        ),
        createdAt: (u.createdAt as Date) || new Date(),
        bio: (u.bio as string) || '',
        pronouns: (u.pronouns as string) || '',
        badges: (u.badges as string[]) || [],
        deletedAt: (u.deletedAt as Date) || null,
        anonymizedUsername: (u.anonymizedUsername as string) || null,
        banner: u.banner ? `/api/v1/profile/picture/${u.banner}` : null,
    };
}
