import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';

import { ServerMessageController } from '../ServerMessageController';

const mockServerRepo = {
    findById: jest.fn(),
};

describe('ServerMessageController embeds', () => {
    const serverId = new Types.ObjectId().toHexString();
    const channelId = new Types.ObjectId().toHexString();
    const userId = new Types.ObjectId().toHexString();

    const mockServerMessageRepo = {
        create: jest.fn(),
        findLastByChannelAndUser: jest.fn(),
    };
    const mockServerMemberRepo = {
        findByServerAndUser: jest.fn(),
    };
    const mockChannelRepo = {
        findById: jest.fn(),
        updateLastMessageAt: jest.fn(),
    };
    const mockReactionRepo = {};
    const mockPermissionService = {
        hasChannelPermission: jest.fn(),
        requireChannelPermission: jest.fn(async function (
            this: {
                hasChannelPermission: (...args: unknown[]) => Promise<boolean>;
            },
            serverId: unknown,
            userId: unknown,
            channelId: unknown,
            permission: unknown,
            error: Error,
        ) {
            if (
                (await this.hasChannelPermission(
                    serverId,
                    userId,
                    channelId,
                    permission,
                )) !== true
            ) {
                throw error;
            }
        }),
    };
    const mockLogger = { debug: jest.fn() };
    const mockWsServer = {
        broadcastToChannel: jest.fn(),
        broadcastToServerWithPermission: jest.fn(),
        broadcastToServer: jest.fn(),
    };
    const mockAuditLogRepo = {};
    const mockServerAuditLogService = {};

    let controller: ServerMessageController;

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new ServerMessageController(
            mockServerMessageRepo as never,
            mockServerMemberRepo as never,
            mockChannelRepo as never,
            mockReactionRepo as never,
            mockPermissionService as never,
            mockLogger as never,
            mockWsServer as never,
            mockAuditLogRepo as never,
            mockServerAuditLogService as never,
            mockServerRepo as never,
            {} as never, // EmbedService
            {
                getClient: jest.fn().mockReturnValue({
                    pipeline: jest.fn().mockReturnValue({
                        set: jest.fn(),
                        exec: jest.fn().mockResolvedValue([]),
                    }),
                }),
            } as never, // IRedisService
            {
                indexChannelMessage: jest.fn().mockResolvedValue(undefined),
                removeChannelMessage: jest.fn().mockResolvedValue(undefined),
            } as never, // IMessageSearchService
        );

        mockServerRepo.findById.mockResolvedValue({
            _id: new Types.ObjectId(serverId),
            ownerId: new Types.ObjectId(),
        });

        mockServerMemberRepo.findByServerAndUser.mockResolvedValue({
            _id: 'm1',
        });
        mockPermissionService.hasChannelPermission.mockResolvedValue(true);
        mockChannelRepo.findById.mockResolvedValue({
            _id: channelId,
            serverId: new Types.ObjectId(serverId),
            type: 'text',
        });
        mockChannelRepo.updateLastMessageAt.mockResolvedValue(undefined);
    });

    it('rejects embeds from non-bot users', async () => {
        const username = 'alice';
        const isBot = false;

        await expect(
            controller.sendMessage(
                serverId,
                channelId,
                userId,
                isBot,
                username,
                {
                    embeds: [{ title: 'Hello' }],
                },
            ),
        ).rejects.toThrow(ForbiddenException);
        expect(mockServerMessageRepo.create).not.toHaveBeenCalled();
    });

    it('rejects components from non-bot users', async () => {
        const username = 'alice';
        const isBot = false;

        await expect(
            controller.sendMessage(
                serverId,
                channelId,
                userId,
                isBot,
                username,
                {
                    components: [
                        {
                            type: 'button',
                            style: 'primary',
                            label: 'Click',
                            custom_id: 'click',
                        },
                    ],
                },
            ),
        ).rejects.toThrow(ForbiddenException);
        expect(mockServerMessageRepo.create).not.toHaveBeenCalled();
    });

    it('allows embeds from bot users and includes embeds in ws payload', async () => {
        const messageId = new Types.ObjectId();
        mockServerMessageRepo.create.mockResolvedValue({
            _id: messageId,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            repliedToMessageId: undefined,
            isPinned: false,
            isSticky: false,
            isWebhook: false,
            embeds: [{ title: 'Bot Embed' }],
            components: [],
        });

        const username = 'helper-bot';
        const isBot = true;

        await controller.sendMessage(
            serverId,
            channelId,
            userId,
            isBot,
            username,
            {
                embeds: [{ title: 'Bot Embed' }],
            },
        );

        expect(mockServerMessageRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                text: '',
                embeds: [{ title: 'Bot Embed' }],
            }),
        );
        expect(mockWsServer.broadcastToChannel).toHaveBeenCalledWith(
            channelId,
            expect.objectContaining({
                type: 'message_server',
                payload: expect.objectContaining({
                    embeds: [{ title: 'Bot Embed' }],
                }),
            }),
        );
    });

    it('allows components from bot users and stores them on the message', async () => {
        const messageId = new Types.ObjectId();
        const components = [
            {
                type: 'button' as const,
                style: 'success' as const,
                label: 'Approve',
                custom_id: 'approve',
            },
        ];
        mockServerMessageRepo.create.mockResolvedValue({
            _id: messageId,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            repliedToMessageId: undefined,
            isPinned: false,
            isSticky: false,
            isWebhook: false,
            embeds: [],
            components,
        });

        const username = 'helper-bot';
        const isBot = true;

        await controller.sendMessage(
            serverId,
            channelId,
            userId,
            isBot,
            username,
            {
                components,
            },
        );

        expect(mockServerMessageRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                text: '',
                components,
            }),
        );
        expect(mockWsServer.broadcastToChannel).toHaveBeenCalledWith(
            channelId,
            expect.objectContaining({
                type: 'message_server',
                payload: expect.objectContaining({
                    components,
                }),
            }),
        );
    });
});
