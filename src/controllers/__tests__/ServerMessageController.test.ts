import { ServerMessageController } from '../ServerMessageController';
import { Types } from 'mongoose';
import type { Request } from 'express';
import type { IServerMessageRepository } from '@/di/interfaces/IServerMessageRepository';
import type { IReactionRepository } from '@/di/interfaces/IReactionRepository';
import type { PermissionService } from '@/permissions/PermissionService';
import type { ILogger } from '@/di/interfaces/ILogger';
import type { WsServer } from '@/ws/server';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IChannelRepository } from '@/di/interfaces/IChannelRepository';
import type { IServerAuditLogService } from '@/di/interfaces/IServerAuditLogService';
import type { IAuditLogRepository } from '@/di/interfaces/IAuditLogRepository';
import type { IServerRepository } from '@/di/interfaces/IServerRepository';
import type { EmbedService } from '@/services/EmbedService';
const VALID_SERVER_ID = '507f1f77bcf86cd799439011';
const VALID_CHANNEL_ID = '507f1f77bcf86cd799439012';
const VALID_USER_ID = '507f1f77bcf86cd799439013';
const VALID_MESSAGE_ID = '507f1f77bcf86cd799439014';

describe('ServerMessageController Manual Instance', () => {
    let controller: ServerMessageController;
    let mockSearchService: {
        indexChannelMessage: jest.Mock;
        removeChannelMessage: jest.Mock;
        updateChannelMessageFlags: jest.Mock;
    };

    const mockServerMessageRepo = {
        findByChannelId: jest.fn(),
        create: jest.fn(),
        findById: jest.fn(),
        update: jest.fn(),
    } as unknown as IServerMessageRepository;
    const mockReactionRepo = {
        getReactionsForMessages: jest.fn().mockResolvedValue({}),
    } as unknown as IReactionRepository;
    const mockPermissionService = {
        hasChannelPermission: jest.fn().mockResolvedValue(true),
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
    } as unknown as PermissionService;
    const mockLogger = {
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
    } as unknown as ILogger;
    const mockWsServer = {
        broadcastToServer: jest.fn(),
        broadcastToChannel: jest.fn(),
        broadcastToServerWithPermission: jest.fn().mockResolvedValue(undefined),
    } as unknown as WsServer;
    const mockChannelRepo = {
        findById: jest.fn().mockResolvedValue({
            _id: VALID_CHANNEL_ID,
            serverId: VALID_SERVER_ID,
            type: 'text',
        }),
        updateLastMessageAt: jest.fn().mockResolvedValue(undefined),
    } as unknown as IChannelRepository;
    const mockServerAuditLogService = {
        createAndBroadcast: jest.fn().mockResolvedValue(undefined),
    } as unknown as IServerAuditLogService;
    const mockServerRepo = {
        findById: jest.fn().mockResolvedValue({
            _id: VALID_SERVER_ID,
            ownerId: VALID_USER_ID,
        }),
    } as unknown as IServerRepository;

    beforeEach(() => {
        jest.clearAllMocks();
        (mockChannelRepo.findById as jest.Mock).mockResolvedValue({
            _id: VALID_CHANNEL_ID,
            serverId: VALID_SERVER_ID,
            type: 'text',
        });
        (mockServerRepo.findById as jest.Mock).mockResolvedValue({
            _id: VALID_SERVER_ID,
            ownerId: VALID_USER_ID,
        });
        (
            mockPermissionService.hasChannelPermission as jest.Mock
        ).mockResolvedValue(true);

        const mockMemberRepo = {
            findByServerAndUser: jest
                .fn()
                .mockResolvedValue({ userId: VALID_USER_ID }),
        };
        mockSearchService = {
            indexChannelMessage: jest.fn().mockResolvedValue(undefined),
            removeChannelMessage: jest.fn().mockResolvedValue(undefined),
            updateChannelMessageFlags: jest.fn().mockResolvedValue(undefined),
        };
        controller = new ServerMessageController(
            mockServerMessageRepo,
            mockMemberRepo as unknown as IServerMemberRepository,
            mockChannelRepo,
            mockReactionRepo,
            mockPermissionService,
            mockLogger,
            mockWsServer,
            {} as unknown as IAuditLogRepository,
            mockServerAuditLogService,
            mockServerRepo,
            {
                processServerMessage: jest.fn().mockResolvedValue(undefined),
                processUserMessage: jest.fn().mockResolvedValue(undefined),
            } as unknown as EmbedService,
            {
                getClient: jest.fn().mockReturnValue({
                    pipeline: jest.fn().mockReturnValue({
                        set: jest.fn(),
                        exec: jest.fn().mockResolvedValue([]),
                    }),
                }),
            } as never,
            mockSearchService as never,
        );
    });

    it('should include interaction metadata in getMessages response', async () => {
        const mockInteraction = {
            command: 'wave',
            options: [],
            user: { id: 'u1', username: 'waver' },
        };

        const mockMsgs = [
            {
                _id: new Types.ObjectId(),
                text: 'Hello!',
                interaction: mockInteraction,
                createdAt: new Date(),
                senderId: new Types.ObjectId().toHexString(),
            },
        ];

        (mockServerMessageRepo.findByChannelId as jest.Mock).mockResolvedValue(
            mockMsgs,
        );
        (
            mockPermissionService.hasChannelPermission as jest.Mock
        ).mockResolvedValue(true);

        const req = { user: { id: VALID_USER_ID } } as unknown as Request;
        const result = await controller.getMessages(
            VALID_SERVER_ID,
            VALID_CHANNEL_ID,
            req.user?.id as string,
        );

        expect(result).toHaveLength(1);
        expect(result[0]).toBeDefined();
        expect(result[0]?.interaction).toEqual(mockInteraction);
    });

    describe('sendMessage search indexing', () => {
        beforeEach(() => {
            (mockServerMessageRepo.create as jest.Mock).mockImplementation(
                async (data: Record<string, unknown>) => ({
                    ...data,
                    _id: new Types.ObjectId(VALID_MESSAGE_ID),
                    createdAt: new Date(),
                }),
            );
        });

        it('indexes the new message with senderIsBot=true when sent by a bot', async () => {
            await controller.sendMessage(
                VALID_SERVER_ID,
                VALID_CHANNEL_ID,
                VALID_USER_ID,
                true,
                'testuser',
                { text: 'hello from a bot' } as never,
            );

            expect(mockSearchService.indexChannelMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    _id: new Types.ObjectId(VALID_MESSAGE_ID),
                }),
                true,
            );
        });

        it('indexes the new message with senderIsBot=false for a regular human sender', async () => {
            await controller.sendMessage(
                VALID_SERVER_ID,
                VALID_CHANNEL_ID,
                VALID_USER_ID,
                false,
                'testuser',
                { text: 'hello from a human' } as never,
            );

            expect(mockSearchService.indexChannelMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    _id: new Types.ObjectId(VALID_MESSAGE_ID),
                }),
                false,
            );
        });
    });

    describe('togglePin / toggleSticky search re-indexing', () => {
        const req = { user: { id: VALID_USER_ID } } as unknown as Request;

        const makeMessage = (overrides: Record<string, unknown> = {}) => ({
            _id: new Types.ObjectId(VALID_MESSAGE_ID),
            channelId: VALID_CHANNEL_ID,
            senderId: new Types.ObjectId(),
            text: 'pin me',
            isPinned: false,
            isSticky: false,
            ...overrides,
        });

        it('togglePin sends a partial flag update instead of a full reindex (must not clobber is_bot/is_webhook)', async () => {
            const message = makeMessage();
            (mockServerMessageRepo.findById as jest.Mock).mockResolvedValue(
                message,
            );
            (mockServerMessageRepo.update as jest.Mock).mockResolvedValue({
                ...message,
                isPinned: true,
            });

            await controller.togglePin(
                VALID_SERVER_ID,
                VALID_CHANNEL_ID,
                VALID_MESSAGE_ID,
                req.user?.id as string,
            );

            expect(
                mockSearchService.updateChannelMessageFlags,
            ).toHaveBeenCalledWith(VALID_MESSAGE_ID, { isPinned: true });
            expect(
                mockSearchService.indexChannelMessage,
            ).not.toHaveBeenCalled();
        });

        it('toggleSticky sends a partial flag update instead of a full reindex', async () => {
            const message = makeMessage();
            (mockServerMessageRepo.findById as jest.Mock).mockResolvedValue(
                message,
            );
            (mockServerMessageRepo.update as jest.Mock).mockResolvedValue({
                ...message,
                isSticky: true,
            });

            await controller.toggleSticky(
                VALID_SERVER_ID,
                VALID_CHANNEL_ID,
                VALID_MESSAGE_ID,
                req.user?.id as string,
            );

            expect(
                mockSearchService.updateChannelMessageFlags,
            ).toHaveBeenCalledWith(VALID_MESSAGE_ID, { isSticky: true });
            expect(
                mockSearchService.indexChannelMessage,
            ).not.toHaveBeenCalled();
        });
    });
});
