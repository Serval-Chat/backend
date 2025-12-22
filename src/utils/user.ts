import { resolveSerializedCustomStatus } from './status';

/**
 * Maps a raw user object from the database to a public user object.
 */
export function mapUser(user: any) {
    if (!user) return null;

    const profilePictureUrl = user.deletedAt
        ? '/images/deleted-cat.jpg'
        : user.profilePicture
          ? `/api/v1/profile/picture/${user.profilePicture}`
          : null;

    return {
        _id: user._id?.toString() || user.id,
        id: user._id?.toString() || user.id,
        username: user.username,
        displayName: user.displayName || null,
        profilePicture: profilePictureUrl,
        usernameFont: user.usernameFont || 'default',
        usernameGradient: user.usernameGradient || {
            enabled: false,
            colors: ['#ffffff', '#ffffff'],
            angle: 90,
        },
        usernameGlow: user.usernameGlow || {
            enabled: false,
            color: '#ffffff',
            intensity: 5,
        },
        customStatus: resolveSerializedCustomStatus(user.customStatus),
        permissions: user.permissions || '0',
        createdAt: user.createdAt || new Date(),
        bio: user.bio || '',
        pronouns: user.pronouns || '',
        badges: user.badges || [],
        deletedAt: user.deletedAt || null,
        anonymizedUsername: user.anonymizedUsername || null,
    };
}
