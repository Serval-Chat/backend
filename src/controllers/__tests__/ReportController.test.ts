import {
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import { UserConnection } from '@/models/UserConnection';
import { ReportController } from '../ReportController';

const report = {
    snowflakeId: '1234567890123456789',
    reporterId: '2234567890123456789',
    targetType: 'message' as const,
    targetId: '3234567890123456789',
    reason: 'spam' as const,
    status: 'open' as const,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('ReportController', () => {
    const reportRepo = {
        getReasonOptions: jest.fn(),
        saveReasonOptions: jest.fn(),
        create: jest.fn(),
        findByReporter: jest.fn(),
        findAll: jest.fn(),
        updateReview: jest.fn(),
    };
    const userRepo = {
        findById: jest.fn(),
        findByIds: jest.fn(),
    };
    const messageRepo = {
        findById: jest.fn(),
        findContextAround: jest.fn(),
    };
    const channelRepo = { findById: jest.fn() };
    const serverMemberRepo = { findByServerAndUser: jest.fn() };
    const serverRepo = { findById: jest.fn() };
    const permissionService = {
        requireChannelPermission: jest.fn(),
        hasChannelPermission: jest.fn(),
    };
    const wsServer = { isUserOnline: jest.fn() };
    const controller = new ReportController(
        reportRepo,
        userRepo as never,
        messageRepo as never,
        channelRepo as never,
        serverMemberRepo as never,
        serverRepo as never,
        permissionService as never,
        wsServer as never,
    );

    beforeEach(() => {
        jest.clearAllMocks();
        wsServer.isUserOnline.mockResolvedValue(true);
        const connectionsQuery = {
            sort: jest.fn().mockReturnThis(),
            exec: jest.fn().mockResolvedValue([]),
        };
        jest.spyOn(UserConnection, 'find').mockReturnValue(
            connectionsQuery as never,
        );
        reportRepo.getReasonOptions.mockResolvedValue([
            {
                id: 'spam',
                targetType: 'message',
                label: 'Spam or scams',
                enabled: true,
                position: 0,
                subcategories: [
                    {
                        id: 'advertising',
                        label: 'Advertising',
                        enabled: true,
                        position: 0,
                    },
                ],
            },
            {
                id: 'other',
                targetType: 'message',
                label: 'Other',
                enabled: true,
                position: 1,
                subcategories: [],
            },
            {
                id: 'user_impersonation',
                targetType: 'user',
                label: 'Impersonation',
                enabled: true,
                position: 0,
                subcategories: [],
            },
            {
                id: 'user_other',
                targetType: 'user',
                label: 'Other profile concern',
                enabled: true,
                position: 1,
                subcategories: [],
            },
        ]);
        userRepo.findByIds.mockResolvedValue([]);
        messageRepo.findById.mockResolvedValue(null);
        messageRepo.findContextAround.mockResolvedValue([]);
        channelRepo.findById.mockResolvedValue({
            type: 'text',
            serverId: '5234567890123456789',
        });
        serverRepo.findById.mockResolvedValue({
            deletedMessageRetentionMinutes: 4320,
        });
        serverMemberRepo.findByServerAndUser.mockResolvedValue({
            userId: report.reporterId,
        });
        permissionService.requireChannelPermission.mockResolvedValue(undefined);
        permissionService.hasChannelPermission.mockResolvedValue(true);
    });

    it('returns only reasons matching the requested target type', async () => {
        await expect(
            controller.getReportReasonOptions('message'),
        ).resolves.toEqual([
            {
                id: 'spam',
                targetType: 'message',
                label: 'Spam or scams',
                subcategories: [{ id: 'advertising', label: 'Advertising' }],
            },
            {
                id: 'other',
                targetType: 'message',
                label: 'Other',
                subcategories: [],
            },
        ]);
        await expect(
            controller.getReportReasonOptions('user'),
        ).resolves.toEqual([
            {
                id: 'user_impersonation',
                targetType: 'user',
                label: 'Impersonation',
                subcategories: [],
            },
            {
                id: 'user_other',
                targetType: 'user',
                label: 'Other profile concern',
                subcategories: [],
            },
        ]);
    });

    it('rejects an unknown report target type when listing reasons', async () => {
        await expect(
            controller.getReportReasonOptions('server'),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('captures message context and content from the stored message', async () => {
        messageRepo.findById.mockResolvedValue({
            senderId: '4234567890123456789',
            serverId: '5234567890123456789',
            channelId: '6234567890123456789',
            text: 'spam text',
            isEdited: true,
            editedAt: new Date('2026-01-02T00:00:00.000Z'),
            referenced_message: {
                snowflakeId: '9234567890123456789',
                senderId: '8234567890123456789',
                text: 'previous message',
            },
            attachments: [
                {
                    attachmentId: 'file-1',
                    type: 'image',
                    mimeType: 'image/png',
                    name: 'evidence.png',
                    size: 42,
                },
            ],
            embeds: [{ title: 'Saved preview', url: 'https://example.test' }],
            components: [{ type: 'button', label: 'Click', style: 'link' }],
            poll: {
                title: 'Question',
                options: [{ id: 'yes', text: 'Yes', votes: ['u1', 'u2'] }],
                multiSelect: false,
            },
        });
        userRepo.findById.mockResolvedValue({ username: 'target' });
        reportRepo.create.mockResolvedValue({
            ...report,
            targetType: 'message',
            targetId: '3234567890123456789',
            reasonLabel: 'Spam or scams',
            subReason: 'advertising',
            subReasonLabel: 'Advertising',
        });

        const result = await controller.create(
            {
                targetType: 'message',
                targetId: '3234567890123456789',
                reason: 'spam',
                details: 'Unwanted promotion',
                subReason: 'advertising',
            },
            report.reporterId,
        );

        expect(reportRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                reporterId: report.reporterId,
                reason: 'spam',
                reasonLabel: 'Spam or scams',
                subReason: 'advertising',
                subReasonLabel: 'Advertising',
                serverId: '5234567890123456789',
                channelId: '6234567890123456789',
                targetUsername: 'target',
                targetUserId: '4234567890123456789',
                messageSnapshot: 'spam text',
                messageContent: expect.objectContaining({
                    text: 'spam text',
                    isEdited: true,
                    editedAt: new Date('2026-01-02T00:00:00.000Z'),
                    reply: expect.objectContaining({
                        id: '9234567890123456789',
                        senderId: '8234567890123456789',
                        text: 'previous message',
                    }),
                    attachments: [
                        expect.objectContaining({ name: 'evidence.png' }),
                    ],
                    embeds: [
                        expect.objectContaining({ title: 'Saved preview' }),
                    ],
                    components: [expect.objectContaining({ label: 'Click' })],
                    poll: {
                        title: 'Question',
                        options: [
                            {
                                id: 'yes',
                                text: 'Yes',
                                emoji: undefined,
                                votes: 2,
                            },
                        ],
                        multiSelect: false,
                        expiresAt: undefined,
                    },
                }),
            }),
        );
        expect(result).toEqual({
            id: report.snowflakeId,
            targetType: 'message',
            targetId: '3234567890123456789',
            reason: 'spam',
            reasonLabel: 'Spam or scams',
            subReason: 'advertising',
            subReasonLabel: 'Advertising',
            createdAt: report.createdAt,
        });
        expect(result).not.toHaveProperty('internalNote');
    });

    it('rejects a message from a server the reporter has left', async () => {
        userRepo.findById.mockResolvedValue({ username: 'target' });
        reportRepo.create.mockResolvedValue({
            ...report,
            targetType: 'message',
            targetId: '3234567890123456789',
        });
        messageRepo.findById.mockResolvedValue({
            senderId: '4234567890123456789',
            serverId: '5234567890123456789',
            channelId: '6234567890123456789',
            text: 'private server content',
        });
        serverMemberRepo.findByServerAndUser.mockResolvedValue(null);

        await expect(
            controller.create(
                {
                    targetType: 'message',
                    targetId: '3234567890123456789',
                    reason: 'spam',
                },
                report.reporterId,
            ),
        ).rejects.toBeInstanceOf(NotFoundException);

        expect(channelRepo.findById).not.toHaveBeenCalled();
        expect(reportRepo.create).not.toHaveBeenCalled();
    });

    it('rejects a server message when the reporter cannot view its channel', async () => {
        userRepo.findById.mockResolvedValue({ username: 'target' });
        reportRepo.create.mockResolvedValue({
            ...report,
            targetType: 'message',
            targetId: '3234567890123456789',
        });
        messageRepo.findById.mockResolvedValue({
            senderId: '4234567890123456789',
            serverId: '5234567890123456789',
            channelId: '6234567890123456789',
            text: 'hidden channel content',
        });
        permissionService.requireChannelPermission.mockRejectedValue(
            new NotFoundException('Report target not found'),
        );

        await expect(
            controller.create(
                {
                    targetType: 'message',
                    targetId: '3234567890123456789',
                    reason: 'spam',
                },
                report.reporterId,
            ),
        ).rejects.toBeInstanceOf(NotFoundException);

        expect(permissionService.requireChannelPermission).toHaveBeenCalledWith(
            '5234567890123456789',
            report.reporterId,
            '6234567890123456789',
            'viewChannels',
            expect.any(NotFoundException),
        );
        expect(reportRepo.create).not.toHaveBeenCalled();
    });

    it('rejects a deleted server message when the reporter cannot see deleted messages', async () => {
        userRepo.findById.mockResolvedValue({ username: 'target' });
        reportRepo.create.mockResolvedValue({
            ...report,
            targetType: 'message',
            targetId: '3234567890123456789',
        });
        messageRepo.findById.mockResolvedValue({
            senderId: '4234567890123456789',
            serverId: '5234567890123456789',
            channelId: '6234567890123456789',
            text: 'deleted content',
            deletedAt: new Date('2026-01-02T00:00:00.000Z'),
        });
        permissionService.hasChannelPermission.mockResolvedValue(false);

        await expect(
            controller.create(
                {
                    targetType: 'message',
                    targetId: '3234567890123456789',
                    reason: 'spam',
                },
                report.reporterId,
            ),
        ).rejects.toBeInstanceOf(NotFoundException);

        expect(permissionService.hasChannelPermission).toHaveBeenCalledWith(
            '5234567890123456789',
            report.reporterId,
            '6234567890123456789',
            'seeDeletedMessages',
        );
        expect(reportRepo.create).not.toHaveBeenCalled();
    });

    it('allows reporting a deleted server message when the reporter can see deleted messages', async () => {
        messageRepo.findById.mockResolvedValue({
            senderId: '4234567890123456789',
            serverId: '5234567890123456789',
            channelId: '6234567890123456789',
            text: 'deleted content',
            deletedAt: new Date(),
        });
        reportRepo.create.mockResolvedValue({
            ...report,
            targetType: 'message',
            targetId: '3234567890123456789',
        });

        await controller.create(
            {
                targetType: 'message',
                targetId: '3234567890123456789',
                reason: 'spam',
            },
            report.reporterId,
        );

        expect(permissionService.hasChannelPermission).toHaveBeenCalledWith(
            '5234567890123456789',
            report.reporterId,
            '6234567890123456789',
            'seeDeletedMessages',
        );
        expect(reportRepo.create).toHaveBeenCalled();
    });

    it('rejects a deleted server message after the configured retention window', async () => {
        messageRepo.findById.mockResolvedValue({
            senderId: '4234567890123456789',
            serverId: '5234567890123456789',
            channelId: '6234567890123456789',
            text: 'expired deleted content',
            deletedAt: new Date(Date.now() - 6 * 60_000),
        });
        serverRepo.findById.mockResolvedValue({
            deletedMessageRetentionMinutes: 5,
        });

        await expect(
            controller.create(
                {
                    targetType: 'message',
                    targetId: '3234567890123456789',
                    reason: 'spam',
                },
                report.reporterId,
            ),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(messageRepo.findContextAround).not.toHaveBeenCalled();
        expect(reportRepo.create).not.toHaveBeenCalled();
    });

    it('rejects a DM message unless the reporter is a channel participant', async () => {
        userRepo.findById.mockResolvedValue({ username: 'target' });
        reportRepo.create.mockResolvedValue({
            ...report,
            targetType: 'message',
            targetId: '3234567890123456789',
        });
        messageRepo.findById.mockResolvedValue({
            senderId: '4234567890123456789',
            channelId: '6234567890123456789',
            text: 'private DM content',
        });
        channelRepo.findById.mockResolvedValue({
            type: 'dm',
            recipientIds: ['4234567890123456789', '7234567890123456789'],
        });

        await expect(
            controller.create(
                {
                    targetType: 'message',
                    targetId: '3234567890123456789',
                    reason: 'spam',
                },
                report.reporterId,
            ),
        ).rejects.toBeInstanceOf(NotFoundException);

        expect(reportRepo.create).not.toHaveBeenCalled();
    });

    it('preserves the full text of a long reportable message', async () => {
        const text = 'x'.repeat(10_000);
        messageRepo.findById.mockResolvedValue({
            senderId: '4234567890123456789',
            serverId: '5234567890123456789',
            channelId: '6234567890123456789',
            text,
        });
        reportRepo.create.mockResolvedValue({
            ...report,
            targetType: 'message',
            targetId: '3234567890123456789',
        });

        await controller.create(
            {
                targetType: 'message',
                targetId: '3234567890123456789',
                reason: 'spam',
            },
            report.reporterId,
        );

        expect(reportRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                messageSnapshot: text,
                messageContent: expect.objectContaining({ text }),
            }),
        );
    });

    it('snapshots nearby messages and the reported message edit history', async () => {
        const editedAt = new Date('2026-10-01T12:00:00.000Z');
        messageRepo.findById.mockResolvedValue({
            snowflakeId: '3234567890123456789',
            senderId: '4234567890123456789',
            serverId: '5234567890123456789',
            channelId: '6234567890123456789',
            text: 'current reported text',
            isEdited: true,
            editedAt,
        });
        messageRepo.findContextAround.mockResolvedValue([
            {
                snowflakeId: '2234567890123456789',
                senderId: '8234567890123456789',
                channelId: '6234567890123456789',
                text: 'nearby text',
                createdAt: new Date('2026-10-01T11:59:00.000Z'),
                editHistory: [],
            },
            {
                snowflakeId: '3234567890123456789',
                senderId: '4234567890123456789',
                channelId: '6234567890123456789',
                text: 'current reported text',
                createdAt: new Date('2026-10-01T12:00:00.000Z'),
                editedAt,
                isEdited: true,
                editHistory: [
                    {
                        text: 'original reported text',
                        editedAt,
                    },
                ],
            },
        ]);
        userRepo.findByIds.mockResolvedValue([
            {
                snowflakeId: '8234567890123456789',
                username: 'nearby-author',
            },
            { snowflakeId: '4234567890123456789', username: 'target' },
        ]);
        userRepo.findById.mockResolvedValue({ username: 'target' });
        reportRepo.create.mockResolvedValue({
            ...report,
            targetType: 'message',
            targetId: '3234567890123456789',
        });

        await controller.create(
            {
                targetType: 'message',
                targetId: '3234567890123456789',
                reason: 'spam',
            },
            report.reporterId,
        );

        expect(messageRepo.findContextAround).toHaveBeenCalledWith(
            '6234567890123456789',
            '3234567890123456789',
            10,
            10,
            true,
            expect.any(Date),
        );
        expect(reportRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                messageSnapshot: 'current reported text',
                messageContent: expect.objectContaining({
                    text: 'current reported text',
                    editHistory: [{ text: 'original reported text', editedAt }],
                }),
                messageContext: [
                    expect.objectContaining({
                        senderUsername: 'nearby-author',
                        text: 'nearby text',
                        isTarget: false,
                    }),
                    expect.objectContaining({
                        senderUsername: 'target',
                        text: 'current reported text',
                        isTarget: true,
                        editHistory: [
                            { text: 'original reported text', editedAt },
                        ],
                    }),
                ],
            }),
        );
    });

    it('rejects reporting the caller account', async () => {
        await expect(
            controller.create(
                {
                    targetType: 'user',
                    targetId: report.reporterId,
                    reason: 'user_other',
                },
                report.reporterId,
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(userRepo.findById).not.toHaveBeenCalled();
    });

    it('rejects a disabled report reason', async () => {
        reportRepo.getReasonOptions.mockResolvedValue([
            {
                id: 'spam',
                targetType: 'user',
                label: 'Spam or scams',
                enabled: false,
                position: 0,
            },
        ]);

        await expect(
            controller.create(
                {
                    targetType: 'user',
                    targetId: '4234567890123456789',
                    reason: 'spam',
                },
                report.reporterId,
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(userRepo.findById).not.toHaveBeenCalled();
        expect(reportRepo.create).not.toHaveBeenCalled();
    });

    it('rejects a disabled subcategory', async () => {
        reportRepo.getReasonOptions.mockResolvedValue([
            {
                id: 'spam',
                targetType: 'user',
                label: 'Spam or scams',
                enabled: true,
                position: 0,
                subcategories: [
                    {
                        id: 'advertising',
                        label: 'Advertising',
                        enabled: false,
                        position: 0,
                    },
                ],
            },
        ]);

        await expect(
            controller.create(
                {
                    targetType: 'user',
                    targetId: '4234567890123456789',
                    reason: 'spam',
                    subReason: 'advertising',
                },
                report.reporterId,
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(userRepo.findById).not.toHaveBeenCalled();
        expect(reportRepo.create).not.toHaveBeenCalled();
    });

    it('rejects a reason configured for the other target type', async () => {
        const targetId = '4234567890123456789';
        userRepo.findById.mockResolvedValue({
            snowflakeId: targetId,
            username: 'target',
            displayName: 'Target User',
            bio: 'Saved profile bio',
            pronouns: 'they/them',
            presenceStatus: 'idle',
            profilePrimaryColor: '#123456',
            profileAccentColor: '#234567',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            badges: [],
        });
        reportRepo.create.mockResolvedValue({
            ...report,
            targetType: 'user',
            targetId,
        });

        await expect(
            controller.create(
                {
                    targetType: 'user',
                    targetId,
                    reason: 'spam',
                },
                report.reporterId,
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(userRepo.findById).not.toHaveBeenCalled();
        expect(reportRepo.create).not.toHaveBeenCalled();
    });

    it('accepts a profile-specific reason for a user report', async () => {
        const targetId = '4234567890123456789';
        userRepo.findById.mockResolvedValue({
            snowflakeId: targetId,
            username: 'target',
            displayName: 'Target User',
            bio: 'Saved profile bio',
            pronouns: 'they/them',
            presenceStatus: 'idle',
            profilePrimaryColor: '#123456',
            profileAccentColor: '#234567',
        });
        reportRepo.create.mockResolvedValue({
            ...report,
            targetType: 'user',
            targetId,
            reason: 'user_impersonation',
            reasonLabel: 'Impersonation',
        });

        const result = await controller.create(
            {
                targetType: 'user',
                targetId,
                reason: 'user_impersonation',
            },
            report.reporterId,
        );

        expect(reportRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                targetType: 'user',
                targetId,
                reason: 'user_impersonation',
                reasonLabel: 'Impersonation',
                userProfileSnapshot: expect.objectContaining({
                    username: 'target',
                    displayName: 'Target User',
                    bio: 'Saved profile bio',
                    pronouns: 'they/them',
                    presenceStatus: 'idle',
                    profilePrimaryColor: '#123456',
                    profileAccentColor: '#234567',
                    connections: [],
                }),
            }),
        );
        expect(result).not.toHaveProperty('userProfileSnapshot');
    });

    it('snapshots the target as offline when they have no active session', async () => {
        const targetId = '4234567890123456789';
        userRepo.findById.mockResolvedValue({
            snowflakeId: targetId,
            username: 'target',
            presenceStatus: 'idle',
        });
        wsServer.isUserOnline.mockResolvedValue(false);
        reportRepo.create.mockResolvedValue({
            ...report,
            targetType: 'user',
            targetId,
        });

        await controller.create(
            {
                targetType: 'user',
                targetId,
                reason: 'user_impersonation',
            },
            report.reporterId,
        );

        expect(wsServer.isUserOnline).toHaveBeenCalledWith(targetId);
        expect(reportRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                userProfileSnapshot: expect.objectContaining({
                    presenceStatus: 'offline',
                }),
            }),
        );
    });

    it('requires at least one enabled reason when staff update options', async () => {
        await expect(
            controller.updateReportReasonOptions({
                options: [
                    {
                        id: 'spam',
                        targetType: 'message',
                        label: 'Spam',
                        enabled: true,
                    },
                    {
                        id: 'user_spam',
                        targetType: 'user',
                        label: 'Spam',
                        enabled: false,
                    },
                ],
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(reportRepo.saveReasonOptions).not.toHaveBeenCalled();
    });

    it('rejects missing targets without creating a report', async () => {
        userRepo.findById.mockResolvedValue(null);
        await expect(
            controller.create(
                {
                    targetType: 'user',
                    targetId: '4234567890123456789',
                    reason: 'user_other',
                },
                report.reporterId,
            ),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(reportRepo.create).not.toHaveBeenCalled();
    });

    it('returns only public report fields to the reporter', async () => {
        reportRepo.findByReporter.mockResolvedValue([
            { ...report, internalNote: 'internal', messageSnapshot: 'secret' },
        ]);

        await expect(controller.getMine(report.reporterId)).resolves.toEqual([
            {
                id: report.snowflakeId,
                targetType: 'message',
                targetId: report.targetId,
                reason: 'spam',
                reasonLabel: 'Spam or scams',
                status: 'open',
                createdAt: report.createdAt,
            },
        ]);
    });

    it('records the reviewer on staff updates', async () => {
        reportRepo.updateReview.mockResolvedValue({
            ...report,
            internalNote: 'Reviewed',
            reviewedBy: '7234567890123456789',
            status: 'resolved',
        });

        await controller.update(
            report.snowflakeId,
            { status: 'resolved', internalNote: 'Reviewed' },
            '7234567890123456789',
        );

        expect(reportRepo.updateReview).toHaveBeenCalledWith(
            report.snowflakeId,
            {
                status: 'resolved',
                internalNote: 'Reviewed',
                reviewedBy: '7234567890123456789',
            },
        );
    });

    it('uses the user target ID for profile navigation on existing user reports', async () => {
        reportRepo.findAll.mockResolvedValue([
            {
                ...report,
                targetType: 'user',
                targetId: '8234567890123456789',
            },
        ]);

        const [result] = await controller.getQueue();

        expect(result?.targetUserId).toBe('8234567890123456789');
    });

    it('returns the saved profile fields and active image availability to staff', async () => {
        reportRepo.findAll.mockResolvedValue([
            {
                ...report,
                targetType: 'user',
                targetId: '8234567890123456789',
                userProfileSnapshot: {
                    snapshotKey: 'a'.repeat(32),
                    username: 'saved-name',
                    bio: 'Saved bio',
                    presenceStatus: 'idle',
                    profilePictureFile: `report-${'a'.repeat(32)}-avatar.webp`,
                    bannerFile: `report-${'a'.repeat(32)}-banner.webp`,
                },
            },
        ]);

        const [result] = await controller.getQueue();

        expect(result?.userProfileSnapshot).toEqual({
            username: 'saved-name',
            displayName: undefined,
            bio: 'Saved bio',
            pronouns: undefined,
            usernameFont: undefined,
            usernameGradient: undefined,
            usernameGlow: undefined,
            customStatus: undefined,
            presenceStatus: 'idle',
            isBot: undefined,
            botVerified: undefined,
            decorationId: undefined,
            badges: undefined,
            privacySettings: undefined,
            connections: undefined,
            bannerColor: undefined,
            profilePrimaryColor: undefined,
            profileAccentColor: undefined,
            createdAt: undefined,
            profilePictureAvailable: true,
            bannerAvailable: true,
        });
        expect(result?.userProfileSnapshot).not.toHaveProperty('snapshotKey');
        expect(result?.userProfileSnapshot).not.toHaveProperty(
            'profilePictureFile',
        );
        expect(result?.userProfileSnapshot).not.toHaveProperty('bannerFile');
    });

    it('resolves the reported author for older message reports', async () => {
        reportRepo.findAll.mockResolvedValue([
            {
                ...report,
                targetType: 'message',
                targetId: '9234567890123456789',
            },
        ]);
        messageRepo.findById.mockResolvedValue({
            senderId: '8234567890123456789',
        });

        const [result] = await controller.getQueue();

        expect(messageRepo.findById).toHaveBeenCalledWith(
            '9234567890123456789',
            true,
        );
        expect(result?.targetUserId).toBe('8234567890123456789');
    });

    it('fills the preview for an older report from the current message', async () => {
        reportRepo.findAll.mockResolvedValue([
            {
                ...report,
                targetType: 'message',
                messageSnapshot: 'saved original text',
            },
        ]);
        messageRepo.findById.mockResolvedValue({
            senderId: '4234567890123456789',
            text: 'edited current text',
            attachments: [],
            embeds: [{ title: 'Current embed' }],
            components: [],
        });

        const [result] = await controller.getQueue();

        expect(result?.messageContent).toEqual(
            expect.objectContaining({
                text: 'saved original text',
                embeds: [{ title: 'Current embed' }],
                isPartialSnapshot: true,
            }),
        );
    });

    it('returns the saved message context and revisions to staff', async () => {
        const messageContext = [
            {
                id: '2234567890123456789',
                senderId: '8234567890123456789',
                senderUsername: 'neighbor',
                isTarget: false,
                text: 'nearby text',
                editHistory: [],
            },
            {
                id: '3234567890123456789',
                senderId: '4234567890123456789',
                senderUsername: 'target',
                isTarget: true,
                text: 'current text',
                editHistory: [
                    {
                        text: 'earlier text',
                        editedAt: new Date('2026-10-01T12:00:00.000Z'),
                    },
                ],
            },
        ];
        reportRepo.findAll.mockResolvedValue([
            { ...report, targetType: 'message', messageContext },
        ]);

        const [result] = await controller.getQueue();

        expect(result?.messageContext).toEqual(messageContext);
    });

    it('includes the reporter profile name in staff reports', async () => {
        reportRepo.findAll.mockResolvedValue([report]);
        userRepo.findByIds.mockResolvedValue([
            {
                snowflakeId: report.reporterId,
                displayName: 'Reporter Name',
                username: 'reporter',
            },
        ]);

        const [result] = await controller.getQueue();

        expect(userRepo.findByIds).toHaveBeenCalledWith([report.reporterId]);
        expect(result?.reporterUsername).toBe('Reporter Name');
    });
});
