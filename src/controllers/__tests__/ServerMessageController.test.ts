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
describe('ServerMessageController Manual Instance', () => {
    let controller: ServerMessageController;

    const mockServerMessageRepo = {
        findByChannelId: jest.fn(),
        create: jest.fn(),
    } as unknown as IServerMessageRepository;
    const mockReactionRepo = {
        getReactionsForMessages: jest.fn().mockResolvedValue({}),
    } as unknown as IReactionRepository;
    const mockPermissionService = {
        hasChannelPermission: jest.fn().mockResolvedValue(true),
    } as unknown as PermissionService;
    const mockLogger = {
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
    } as unknown as ILogger;
    const mockWsServer = {
        broadcastToServer: jest.fn(),
    } as unknown as WsServer;

    beforeEach(() => {
        const mockMemberRepo = {
            findByServerAndUser: jest
                .fn()
                .mockResolvedValue({ userId: '507f1f77bcf86cd799439013' }),
        };
        controller = new ServerMessageController(
            mockServerMessageRepo,
            mockMemberRepo as unknown as IServerMemberRepository,
            {
                findById: jest
                    .fn()
                    .mockResolvedValue({
                        _id: '507f1f77bcf86cd799439012',
                        serverId: '507f1f77bcf86cd799439011',
                        type: 'text',
                    }),
            } as unknown as IChannelRepository,
            mockReactionRepo,
            mockPermissionService,
            mockLogger,
            mockWsServer,
            {} as unknown as IAuditLogRepository,
            {} as unknown as IServerAuditLogService,
            {
                findById: jest
                    .fn()
                    .mockResolvedValue({ _id: '507f1f77bcf86cd799439011' }),
            } as unknown as IServerRepository,
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

        const VALID_SERVER_ID = '507f1f77bcf86cd799439011';
        const VALID_CHANNEL_ID = '507f1f77bcf86cd799439012';
        const VALID_USER_ID = '507f1f77bcf86cd799439013';

        const req = { user: { id: VALID_USER_ID } } as unknown as Request;
        const result = await controller.getMessages(
            VALID_SERVER_ID,
            VALID_CHANNEL_ID,
            req,
        );

        expect(result).toHaveLength(1);
        expect(result[0]).toBeDefined();
        expect(result[0]?.interaction).toEqual(mockInteraction);
    });
});
