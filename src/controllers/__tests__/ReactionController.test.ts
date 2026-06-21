import { ReactionController } from '../ReactionController';
import { Types } from 'mongoose';
import type { AddUnicodeReactionRequestDTO } from '../dto/reaction.request.dto';
import { EmojiTypeDTO } from '../dto/reaction.request.dto';
import type { IReactionRepository } from '@/di/interfaces/IReactionRepository';
import type { IMessageRepository } from '@/di/interfaces/IMessageRepository';
import type { IServerMessageRepository } from '@/di/interfaces/IServerMessageRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IChannelRepository } from '@/di/interfaces/IChannelRepository';
import type { PermissionService } from '@/permissions/PermissionService';
import type { WsServer } from '@/ws/server';
import type { IBlockRepository } from '@/di/interfaces/IBlockRepository';
import type { IFriendshipRepository } from '@/di/interfaces/IFriendshipRepository';
import type { IAuditLogRepository } from '@/di/interfaces/IAuditLogRepository';
import type { IServerAuditLogService } from '@/di/interfaces/IServerAuditLogService';
import type { IMuteRepository } from '@/di/interfaces/IMuteRepository';
import { ForbiddenException } from '@nestjs/common';

describe('ReactionController', () => {
    let controller: ReactionController;

    const mockReactionRepo = {
        addReaction: jest.fn().mockResolvedValue({}),
        getReactionsByMessage: jest.fn().mockResolvedValue([]),
    } as unknown as IReactionRepository;
    const mockMessageRepo = {
        findById: jest.fn(),
    } as unknown as IMessageRepository;
    const mockServerMessageRepo = {
        findById: jest.fn(),
    } as unknown as IServerMessageRepository;
    const mockServerMemberRepo = {
        findByServerAndUser: jest.fn().mockResolvedValue({ userId: 'u1' }),
    } as unknown as IServerMemberRepository;
    const mockChannelRepo = {
        findById: jest.fn(),
    } as unknown as IChannelRepository;
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
    const mockWsServer = {
        broadcastToServer: jest.fn(),
        broadcastToUser: jest.fn(),
    } as unknown as WsServer;
    const mockBlockRepo = {
        getActiveBlockFlags: jest.fn().mockResolvedValue(0),
    } as unknown as IBlockRepository;
    const mockMuteRepo = {
        checkExpired: jest.fn().mockResolvedValue(undefined),
        findActiveByUserId: jest.fn().mockResolvedValue(null),
    } as unknown as IMuteRepository;

    beforeEach(() => {
        controller = new ReactionController(
            mockReactionRepo,
            mockMessageRepo,
            mockServerMessageRepo,
            mockServerMemberRepo,
            mockChannelRepo,
            mockPermissionService,
            mockWsServer,
            {} as unknown as IFriendshipRepository, // friendshipRepo
            {} as unknown as IAuditLogRepository, // auditLogRepo
            {} as unknown as IServerAuditLogService, // serverAuditLogService
            mockBlockRepo,
            mockMuteRepo,
        );
        jest.clearAllMocks();
        (mockMuteRepo.findActiveByUserId as jest.Mock).mockResolvedValue(null);
    });

    describe('addServerReaction', () => {
        it('should broadcast reaction with serverId and channelId', async () => {
            const SERVER_ID = new Types.ObjectId().toHexString();
            const CHANNEL_ID = new Types.ObjectId().toHexString();
            const MESSAGE_ID = new Types.ObjectId().toHexString();
            const USER_ID = new Types.ObjectId().toHexString();

            (mockServerMessageRepo.findById as jest.Mock).mockResolvedValue({
                _id: new Types.ObjectId(MESSAGE_ID),
                serverId: new Types.ObjectId(SERVER_ID),
                channelId: new Types.ObjectId(CHANNEL_ID),
                senderId: new Types.ObjectId().toHexString(),
            });

            (mockChannelRepo.findById as jest.Mock).mockResolvedValue({
                _id: new Types.ObjectId(CHANNEL_ID),
                serverId: new Types.ObjectId(SERVER_ID),
            });

            const body: AddUnicodeReactionRequestDTO = {
                emoji: '👍',
                emojiType: EmojiTypeDTO.UNICODE,
            };

            await controller.addServerReaction(
                SERVER_ID,
                CHANNEL_ID,
                MESSAGE_ID,
                USER_ID,
                'testuser',
                body,
            );

            expect(mockWsServer.broadcastToServer).toHaveBeenCalledWith(
                SERVER_ID,
                expect.objectContaining({
                    type: 'reaction_added',
                    payload: expect.objectContaining({
                        serverId: SERVER_ID,
                        channelId: CHANNEL_ID,
                    }),
                }),
            );
        });

        it('rejects muted users before adding reactions', async () => {
            const SERVER_ID = new Types.ObjectId().toHexString();
            const CHANNEL_ID = new Types.ObjectId().toHexString();
            const MESSAGE_ID = new Types.ObjectId().toHexString();
            const USER_ID = new Types.ObjectId().toHexString();

            (mockMuteRepo.findActiveByUserId as jest.Mock).mockResolvedValue({
                _id: new Types.ObjectId(),
                userId: new Types.ObjectId(USER_ID),
            });

            await expect(
                controller.addServerReaction(
                    SERVER_ID,
                    CHANNEL_ID,
                    MESSAGE_ID,
                    USER_ID,
                    'testuser',
                    {
                        emoji: '👍',
                        emojiType: EmojiTypeDTO.UNICODE,
                    },
                ),
            ).rejects.toThrow(ForbiddenException);

            expect(
                mockServerMemberRepo.findByServerAndUser,
            ).not.toHaveBeenCalled();
            expect(mockReactionRepo.addReaction).not.toHaveBeenCalled();
        });
    });
});
