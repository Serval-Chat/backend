import { randomBytes } from 'crypto';
import { copyFile, mkdir, unlink } from 'fs/promises';
import path from 'path';

import type { IUser } from '@/di/interfaces/IUserRepository';
import { Badge } from '@/models/Badge';
import type { ReportUserProfileSnapshot } from '@/models/Report';
import { UserConnection } from '@/models/UserConnection';
import type { PresenceStatus } from '@/types/presence';
import logger from '@/utils/logger';
import { resolveSerializedCustomStatus } from '@/utils/status';

const reportSnapshotDirectory = (): string =>
    path.join(process.cwd(), 'uploads', 'report-snapshots');

type SnapshotImageKind = 'avatar' | 'banner';

type ReportUserProfileSource = Pick<
    IUser,
    | 'snowflakeId'
    | 'username'
    | 'displayName'
    | 'usernameFont'
    | 'usernameGradient'
    | 'usernameGlow'
    | 'bio'
    | 'pronouns'
    | 'customStatus'
    | 'presenceStatus'
    | 'isBot'
    | 'botVerified'
    | 'decorationId'
    | 'badges'
    | 'privacySettings'
    | 'profilePicture'
    | 'banner'
    | 'bannerColor'
    | 'profilePrimaryColor'
    | 'profileAccentColor'
    | 'createdAt'
>;

export async function createReportUserProfileSnapshot(
    user: ReportUserProfileSource,
    presenceStatus: PresenceStatus = user.presenceStatus ?? 'online',
): Promise<ReportUserProfileSnapshot> {
    const snapshotKey = randomBytes(16).toString('hex');
    const snapshot: ReportUserProfileSnapshot = {
        snapshotKey,
        username: user.username ?? user.displayName ?? 'Unknown user',
        displayName: user.displayName ?? null,
        bio: user.bio,
        pronouns: user.pronouns,
        usernameFont: user.usernameFont,
        usernameGradient: user.usernameGradient
            ? {
                  ...user.usernameGradient,
                  colors: [...user.usernameGradient.colors],
              }
            : undefined,
        usernameGlow: user.usernameGlow ? { ...user.usernameGlow } : undefined,
        customStatus: (() => {
            const status = resolveSerializedCustomStatus(user.customStatus);
            if (!status) return undefined;
            return {
                text: status.text,
                ...(status.emoji !== null && status.emoji !== ''
                    ? { emoji: status.emoji }
                    : {}),
            };
        })(),
        presenceStatus,
        isBot: user.isBot ?? false,
        botVerified: user.botVerified ?? false,
        decorationId: user.decorationId,
        privacySettings: {
            privateProfile: user.privacySettings?.privateProfile ?? false,
            hideDisplayName: user.privacySettings?.hideDisplayName ?? false,
            hidePronouns: user.privacySettings?.hidePronouns ?? false,
            hideConnections: user.privacySettings?.hideConnections ?? false,
            hideBio: user.privacySettings?.hideBio ?? false,
            hideStatus: user.privacySettings?.hideStatus ?? false,
        },
        connections: [],
        bannerColor: user.bannerColor,
        profilePrimaryColor: user.profilePrimaryColor ?? undefined,
        profileAccentColor: user.profileAccentColor ?? undefined,
        createdAt: user.createdAt,
    };

    try {
        const connections = await UserConnection.find({
            userId: user.snowflakeId,
            status: 'verified',
        })
            .sort({ verifiedAt: 1, createdAt: 1 })
            .exec();
        snapshot.connections = connections.map((connection) => ({
            id: connection.snowflakeId,
            type: connection.type,
            value: connection.value,
        }));
    } catch (error) {
        logger.warn('Failed to snapshot report profile connections', { error });
    }

    if ((user.badges?.length ?? 0) > 0) {
        try {
            const badges = await Badge.find({
                $or: [
                    { id: { $in: user.badges } },
                    { snowflakeId: { $in: user.badges } },
                ],
            })
                .lean()
                .exec();
            snapshot.badges = badges.map((badge) => ({
                id: badge.id,
                name: badge.name,
                description: badge.description,
                icon: badge.icon,
                color: badge.color,
                createdAt: badge.createdAt,
            }));
        } catch (error) {
            logger.warn('Failed to snapshot report profile badges', { error });
        }
    }

    const [profilePictureFile, bannerFile] = await Promise.all([
        copyProfileImage(
            user.profilePicture,
            snapshotKey,
            'avatar',
            'profiles',
        ),
        copyProfileImage(user.banner, snapshotKey, 'banner', 'banners'),
    ]);

    if (profilePictureFile !== undefined) {
        snapshot.profilePictureFile = profilePictureFile;
    }
    if (bannerFile !== undefined) snapshot.bannerFile = bannerFile;

    return snapshot;
}

export function getReportUserProfileImagePath(
    snapshot: ReportUserProfileSnapshot,
    kind: SnapshotImageKind,
): string | undefined {
    const filename =
        kind === 'avatar' ? snapshot.profilePictureFile : snapshot.bannerFile;
    if (
        filename === undefined ||
        filename === '' ||
        snapshot.snapshotKey === undefined ||
        snapshot.snapshotKey === ''
    ) {
        return undefined;
    }

    const match =
        /^report-([a-f0-9]{32})-(avatar|banner)\.(gif|webp|png|jpe?g|avif)$/i.exec(
            filename,
        );
    if (!match || match[1] !== snapshot.snapshotKey || match[2] !== kind) {
        return undefined;
    }

    return path.join(reportSnapshotDirectory(), filename);
}

export async function deleteReportUserProfileSnapshotImages(
    snapshot: ReportUserProfileSnapshot,
): Promise<void> {
    const imagePaths = (['avatar', 'banner'] as const)
        .map((kind) => getReportUserProfileImagePath(snapshot, kind))
        .filter((imagePath): imagePath is string => imagePath !== undefined);

    await Promise.all(
        imagePaths.map(async (imagePath) => {
            try {
                await unlink(imagePath);
            } catch (error) {
                if (
                    typeof error === 'object' &&
                    error !== null &&
                    'code' in error &&
                    error.code === 'ENOENT'
                ) {
                    return;
                }
                logger.warn(
                    'Failed to delete a report profile snapshot image',
                    {
                        error,
                    },
                );
            }
        }),
    );
}

async function copyProfileImage(
    imageReference: string | undefined,
    snapshotKey: string,
    kind: SnapshotImageKind,
    sourceDirectory: 'profiles' | 'banners',
): Promise<string | undefined> {
    if (
        imageReference === undefined ||
        imageReference === '' ||
        imageReference.includes('deleted-user-avatar') ||
        imageReference.endsWith('deleted-cat.jpg')
    ) {
        return undefined;
    }

    const sourceFilename = path.basename(imageReference);
    const extension = path.extname(sourceFilename).toLowerCase();
    if (!/^\.(gif|webp|png|jpe?g|avif)$/.test(extension)) {
        return undefined;
    }

    const sourcePath = path.join(
        process.cwd(),
        'uploads',
        sourceDirectory,
        sourceFilename,
    );
    const targetFilename = `report-${snapshotKey}-${kind}${extension}`;
    const targetPath = path.join(reportSnapshotDirectory(), targetFilename);

    try {
        await mkdir(reportSnapshotDirectory(), { recursive: true });
        await copyFile(sourcePath, targetPath);
        return targetFilename;
    } catch (error) {
        logger.warn('Failed to copy a report profile snapshot image', {
            error,
            kind,
        });
        return undefined;
    }
}
