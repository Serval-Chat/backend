/* eslint-disable @typescript-eslint/no-explicit-any */
import { ReactionController } from '../ReactionController';
import { Types } from 'mongoose';
import type { AddUnicodeReactionRequestDTO } from '../dto/reaction.request.dto';
import { EmojiTypeDTO } from '../dto/reaction.request.dto';
import type { IFriendshipRepository } from '@/di/interfaces/IFriendshipRepository';
import type { IAuditLogRepository } from '@/di/interfaces/IAuditLogRepository';
import type { IServerAuditLogService } from '@/di/interfaces/IServerAuditLogService';
import { ForbiddenException } from '@nestjs/common';

describe('ReactionController', () => {
    let controller: ReactionController;

    const mockReactionRepo = {
        addReaction: jest.fn().mockResolvedValue({}),
        getReactionsByMessage: jest.fn().mockResolvedValue([]),
    } as any;
    const mockMessageRepo = {
        findById: jest.fn(),
    } as any;
    const mockEmojiRepo = {
        findById: jest.fn().mockResolvedValue(null),
    } as any;
    const mockServerMemberRepo = {
        findByServerAndUser: jest.fn().mockResolvedValue({ userId: 'u1' }),
    } as any;
    const mockChannelRepo = {
        findById: jest.fn(),
    } as any;
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
    } as any;
    const mockWsServer = {
        broadcastToServer: jest.fn(),
        broadcastToUser: jest.fn(),
    } as any;
    const mockBlockRepo = {
        getActiveBlockFlags: jest.fn().mockResolvedValue(0),
    } as any;
    const mockMuteRepo = {
        checkExpired: jest.fn().mockResolvedValue(undefined),
        findActiveByUserId: jest.fn().mockResolvedValue(null),
    } as any;
    const mockWarningRepo = {
        hasUnacknowledged: jest.fn().mockResolvedValue(false),
    } as any;

    beforeEach(() => {
        controller = new ReactionController(
            mockReactionRepo,
            mockEmojiRepo,
            mockMessageRepo,
            mockServerMemberRepo,
            mockChannelRepo,
            mockPermissionService,
            mockWsServer,
            {} as IFriendshipRepository, // friendshipRepo
            {} as IAuditLogRepository, // auditLogRepo
            {} as IServerAuditLogService, // serverAuditLogService
            mockBlockRepo,
            mockMuteRepo,
            mockWarningRepo,
        );
        jest.clearAllMocks();
        (mockMuteRepo.findActiveByUserId as jest.Mock).mockResolvedValue(null);
        (mockWarningRepo.hasUnacknowledged as jest.Mock).mockResolvedValue(
            false,
        );
    });

    describe('addServerReaction', () => {
        it('should broadcast reaction with serverId and channelId', async () => {
            const SERVER_ID = new Types.ObjectId().toHexString();
            const CHANNEL_ID = new Types.ObjectId().toHexString();
            const MESSAGE_ID = new Types.ObjectId().toHexString();
            const USER_ID = new Types.ObjectId().toHexString();

            (mockMessageRepo.findById as jest.Mock).mockResolvedValue({
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

        describe('external emoji permission', () => {
            const SERVER_ID = new Types.ObjectId().toHexString();
            const FOREIGN_SERVER_ID = new Types.ObjectId().toHexString();
            const CHANNEL_ID = new Types.ObjectId().toHexString();
            const MESSAGE_ID = new Types.ObjectId().toHexString();
            const USER_ID = new Types.ObjectId().toHexString();
            const EMOJI_ID = new Types.ObjectId().toHexString();

            beforeEach(() => {
                (mockMessageRepo.findById as jest.Mock).mockResolvedValue({
                    _id: new Types.ObjectId(MESSAGE_ID),
                    serverId: new Types.ObjectId(SERVER_ID),
                    channelId: new Types.ObjectId(CHANNEL_ID),
                    senderId: new Types.ObjectId().toHexString(),
                });
                (mockChannelRepo.findById as jest.Mock).mockResolvedValue({
                    _id: new Types.ObjectId(CHANNEL_ID),
                    serverId: new Types.ObjectId(SERVER_ID),
                });
            });

            it('allows a custom emoji belonging to the same server', async () => {
                (mockEmojiRepo.findById as jest.Mock).mockResolvedValue({
                    serverId: SERVER_ID,
                });
                (
                    mockPermissionService.hasChannelPermission as jest.Mock
                ).mockImplementation(
                    async (_s, _u, _c, perm: string) =>
                        perm !== 'useExternalEmojisAndStickers',
                );

                await expect(
                    controller.addServerReaction(
                        SERVER_ID,
                        CHANNEL_ID,
                        MESSAGE_ID,
                        USER_ID,
                        'testuser',
                        {
                            emoji: 'wave',
                            emojiType: EmojiTypeDTO.CUSTOM,
                            emojiId: EMOJI_ID,
                        },
                    ),
                ).resolves.toBeDefined();
            });

            it('rejects a foreign-server emoji when the permission is denied', async () => {
                (mockEmojiRepo.findById as jest.Mock).mockResolvedValue({
                    serverId: FOREIGN_SERVER_ID,
                });
                (
                    mockPermissionService.hasChannelPermission as jest.Mock
                ).mockImplementation(
                    async (_s, _u, _c, perm: string) =>
                        perm !== 'useExternalEmojisAndStickers',
                );

                await expect(
                    controller.addServerReaction(
                        SERVER_ID,
                        CHANNEL_ID,
                        MESSAGE_ID,
                        USER_ID,
                        'testuser',
                        {
                            emoji: 'wave',
                            emojiType: EmojiTypeDTO.CUSTOM,
                            emojiId: EMOJI_ID,
                        },
                    ),
                ).rejects.toThrow();
                expect(mockReactionRepo.addReaction).not.toHaveBeenCalled();
            });

            it('allows a foreign-server emoji when the permission is granted', async () => {
                (mockEmojiRepo.findById as jest.Mock).mockResolvedValue({
                    serverId: FOREIGN_SERVER_ID,
                });
                (
                    mockPermissionService.hasChannelPermission as jest.Mock
                ).mockResolvedValue(true);

                await expect(
                    controller.addServerReaction(
                        SERVER_ID,
                        CHANNEL_ID,
                        MESSAGE_ID,
                        USER_ID,
                        'testuser',
                        {
                            emoji: 'wave',
                            emojiType: EmojiTypeDTO.CUSTOM,
                            emojiId: EMOJI_ID,
                        },
                    ),
                ).resolves.toBeDefined();
            });
        });
    });
});
