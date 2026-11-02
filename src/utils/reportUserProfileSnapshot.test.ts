import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';

import { Badge } from '@/models/Badge';
import { UserConnection } from '@/models/UserConnection';
import {
    createReportUserProfileSnapshot,
    deleteReportUserProfileSnapshotImages,
    getReportUserProfileImagePath,
} from '@/utils/reportUserProfileSnapshot';

describe('report user profile snapshots', () => {
    let rootDirectory: string;

    beforeEach(async () => {
        rootDirectory = await mkdtemp(
            path.join(os.tmpdir(), 'serchat-report-profile-'),
        );
        jest.spyOn(process, 'cwd').mockReturnValue(rootDirectory);

        await mkdir(path.join(rootDirectory, 'uploads', 'profiles'), {
            recursive: true,
        });
        await mkdir(path.join(rootDirectory, 'uploads', 'banners'), {
            recursive: true,
        });
        await writeFile(
            path.join(rootDirectory, 'uploads', 'profiles', 'avatar.webp'),
            'avatar snapshot bytes',
        );
        await writeFile(
            path.join(rootDirectory, 'uploads', 'banners', 'banner.gif'),
            'banner snapshot bytes',
        );

        const connectionQuery = {
            sort: jest.fn().mockReturnThis(),
            exec: jest.fn().mockResolvedValue([
                {
                    snowflakeId: '1234567890123456789',
                    type: 'Website',
                    value: 'example.com',
                },
            ]),
        };
        jest.spyOn(UserConnection, 'find').mockReturnValue(
            connectionQuery as never,
        );
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await rm(rootDirectory, { recursive: true, force: true });
    });

    it('captures profile card fields, connections, and independent image copies', async () => {
        const badgeQuery = {
            lean: jest.fn().mockReturnThis(),
            exec: jest.fn().mockResolvedValue([
                {
                    id: 'badge-id',
                    name: 'Contributor',
                    description: 'A contributor',
                    icon: 'star',
                    color: '#abcdef',
                    createdAt: new Date('2025-01-01T00:00:00.000Z'),
                },
            ]),
        };
        jest.spyOn(Badge, 'find').mockReturnValue(badgeQuery as never);

        const snapshot = await createReportUserProfileSnapshot({
            snowflakeId: '2234567890123456789',
            username: 'alice',
            displayName: 'Alice',
            usernameFont: 'Audiowide',
            usernameGradient: {
                enabled: true,
                colors: ['#112233', '#445566'],
                angle: 42,
            },
            usernameGlow: {
                enabled: true,
                color: '#778899',
                intensity: 7,
            },
            bio: 'Profile at report time',
            pronouns: 'she/her',
            customStatus: {
                text: 'Saved status',
                emoji: '📌',
                expiresAt: null,
                updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            },
            profilePicture: 'avatar.webp',
            banner: 'banner.gif',
            bannerColor: '#123456',
            profilePrimaryColor: '#234567',
            profileAccentColor: '#345678',
            presenceStatus: 'idle',
            isBot: true,
            botVerified: true,
            decorationId: 'decoration-id',
            badges: ['badge-id'],
            privacySettings: {
                privateProfile: true,
                hideDisplayName: true,
                hidePronouns: true,
                hideConnections: true,
                hideBio: true,
                hideStatus: true,
            },
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
        });

        expect(snapshot).toEqual(
            expect.objectContaining({
                username: 'alice',
                displayName: 'Alice',
                usernameFont: 'Audiowide',
                usernameGradient: {
                    enabled: true,
                    colors: ['#112233', '#445566'],
                    angle: 42,
                },
                usernameGlow: {
                    enabled: true,
                    color: '#778899',
                    intensity: 7,
                },
                bio: 'Profile at report time',
                pronouns: 'she/her',
                customStatus: { text: 'Saved status', emoji: '📌' },
                presenceStatus: 'idle',
                isBot: true,
                botVerified: true,
                decorationId: 'decoration-id',
                badges: [
                    {
                        id: 'badge-id',
                        name: 'Contributor',
                        description: 'A contributor',
                        icon: 'star',
                        color: '#abcdef',
                        createdAt: new Date('2025-01-01T00:00:00.000Z'),
                    },
                ],
                privacySettings: {
                    privateProfile: true,
                    hideDisplayName: true,
                    hidePronouns: true,
                    hideConnections: true,
                    hideBio: true,
                    hideStatus: true,
                },
                connections: [
                    {
                        id: '1234567890123456789',
                        type: 'Website',
                        value: 'example.com',
                    },
                ],
            }),
        );
        expect(Badge.find).toHaveBeenCalledWith({
            $or: [
                { id: { $in: ['badge-id'] } },
                { snowflakeId: { $in: ['badge-id'] } },
            ],
        });
        expect(UserConnection.find).toHaveBeenCalledWith({
            userId: '2234567890123456789',
            status: 'verified',
        });

        const avatarPath = getReportUserProfileImagePath(snapshot, 'avatar');
        const bannerPath = getReportUserProfileImagePath(snapshot, 'banner');
        expect(avatarPath).toBeDefined();
        expect(bannerPath).toBeDefined();
        if (avatarPath === undefined || bannerPath === undefined) {
            throw new Error('Expected snapshot image paths to be defined');
        }

        await expect(readFile(avatarPath, 'utf8')).resolves.toBe(
            'avatar snapshot bytes',
        );
        await expect(readFile(bannerPath, 'utf8')).resolves.toBe(
            'banner snapshot bytes',
        );

        await deleteReportUserProfileSnapshotImages(snapshot);

        await expect(readFile(avatarPath)).rejects.toMatchObject({
            code: 'ENOENT',
        });
        await expect(readFile(bannerPath)).rejects.toMatchObject({
            code: 'ENOENT',
        });
    });
});
