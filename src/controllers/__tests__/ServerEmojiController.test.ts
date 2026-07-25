/* eslint-disable @typescript-eslint/no-explicit-any */
import { ServerEmojiController } from '../ServerEmojiController';
import { Types } from 'mongoose';
import { generateSnowflakeId } from '@/utils/snowflake';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type { Request as ExpressRequest } from 'express';

jest.mock('@/config/env', () => ({
    PORT: 3000,
    JWT_SECRET: 'test',
    APP_ENCRYPTION_KEY: '01234567890123456789012345678901',
    MONGO_URI: 'mongodb://localhost:27017/test',
    PROJECT_LEVEL: 'development',
    LOGS_PATH: 'logs',
    PUBLIC_FOLDER_PATH: 'public',
    USE_HTTPS: 'off',
    SERVER_URL: 'http://localhost:3000',
    SNOWFLAKE_WORKER_ID: 0,
}));

jest.mock('fs');
jest.mock('path');
jest.mock('@/utils/logger', () => ({
    logger: {
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        add: jest.fn(),
    },
}));
jest.mock('@/utils/imageProcessing', () => ({
    processAndSaveImage: jest.fn().mockResolvedValue(undefined),
    isAnimatedImage: jest.fn().mockResolvedValue(false),
    getImageMetadata: jest.fn().mockResolvedValue({
        format: 'webp',
        width: 320,
        height: 320,
    }),
    ImagePresets: {
        emoji: jest.fn().mockReturnValue({}),
    },
}));

describe('ServerEmojiController', () => {
    let controller: ServerEmojiController;

    const mockEmojiRepo = {
        findByServerId: jest.fn(),
        findById: jest.fn(),
        findByServerAndName: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        findByIdWithCreator: jest.fn(),
        findByServerIdWithCreator: jest.fn(),
    } as any;

    const mockServerRepo = {
        findById: jest.fn(),
    } as any;

    const mockServerMemberRepo = {
        findByServerAndUser: jest.fn(),
    } as any;

    const mockPermissionService = {
        hasPermission: jest.fn(),
    } as any;

    const mockWsServer = {
        broadcastToServer: jest.fn(),
    } as any;

    const mockLogger = {
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
    } as any;

    const mockServerAuditLogService = {
        createAndBroadcast: jest.fn(),
    } as any;

    const mockMuteRepo = {
        checkExpired: jest.fn().mockResolvedValue(undefined),
        findActiveByUserId: jest.fn().mockResolvedValue(null),
    } as any;

    const mockWarningRepo = {
        hasUnacknowledged: jest.fn().mockResolvedValue(false),
    } as any;

    beforeEach(() => {
        controller = new ServerEmojiController(
            mockEmojiRepo,
            mockServerRepo,
            mockServerMemberRepo,
            mockPermissionService,
            mockLogger,
            mockWsServer,
            mockServerAuditLogService,
            mockMuteRepo,
            mockWarningRepo,
        );
        jest.clearAllMocks();
        (mockMuteRepo.findActiveByUserId as jest.Mock).mockResolvedValue(null);
        (mockWarningRepo.hasUnacknowledged as jest.Mock).mockResolvedValue(
            false,
        );
        (path.join as jest.Mock).mockImplementation((...args) =>
            args.join('/'),
        );
        (fs.existsSync as jest.Mock).mockReturnValue(true);
    });

    const SERVER_ID = generateSnowflakeId();
    const USER_ID = generateSnowflakeId();
    const EMOJI_ID = generateSnowflakeId();

    describe('getServerEmojis', () => {
        it('should return emojis for a server member', async () => {
            const req = { user: { id: USER_ID } } as ExpressRequest;
            (
                mockServerMemberRepo.findByServerAndUser as jest.Mock
            ).mockResolvedValue({});
            (
                mockEmojiRepo.findByServerIdWithCreator as jest.Mock
            ).mockResolvedValue([
                {
                    _id: new Types.ObjectId(),
                    snowflakeId: EMOJI_ID,
                    name: 'test_emoji',
                    imageUrl: 'url',
                    serverId: SERVER_ID,
                    createdBy: USER_ID,
                    createdAt: new Date(),
                },
            ]);

            const result = await controller.getServerEmojis(
                SERVER_ID,
                req.user?.id as string,
            );

            expect(result).toHaveLength(1);
            expect(result[0]?.name).toBe('test_emoji');
        });

        it('should throw Forbidden if user is not a member', async () => {
            const req = { user: { id: USER_ID } } as ExpressRequest;
            (
                mockServerMemberRepo.findByServerAndUser as jest.Mock
            ).mockResolvedValue(null);

            await expect(
                controller.getServerEmojis(SERVER_ID, req.user?.id as string),
            ).rejects.toThrow(ForbiddenException);
        });
    });

    describe('uploadEmoji', () => {
        const file = {
            path: 'temp/path',
            buffer: Buffer.from(''),
            size: 1024,
        } as Express.Multer.File;

        it('should upload emoji and broadcast emoji_created and emoji_updated events', async () => {
            const req = { user: { id: USER_ID } } as ExpressRequest;
            (mockServerRepo.findById as jest.Mock).mockResolvedValue({
                _id: SERVER_ID,
                ownerId: generateSnowflakeId(),
            });
            (
                mockPermissionService.hasPermission as jest.Mock
            ).mockResolvedValue(true);
            (mockEmojiRepo.findByServerAndName as jest.Mock).mockResolvedValue(
                null,
            );
            const createdEmoji = {
                _id: new Types.ObjectId(),
                snowflakeId: EMOJI_ID,
                name: 'test_emoji',
                imageUrl: '/uploads/emojis/test.png',
                serverId: SERVER_ID,
                createdBy: USER_ID,
                createdAt: new Date(),
            };
            (mockEmojiRepo.create as jest.Mock).mockResolvedValue(createdEmoji);
            (mockEmojiRepo.findByIdWithCreator as jest.Mock).mockResolvedValue(
                createdEmoji,
            );

            const result = await controller.uploadEmoji(
                SERVER_ID,
                req.user?.id as string,
                file,
                { name: 'test_emoji' },
            );

            expect(result.name).toBe('test_emoji');
            expect(mockWsServer.broadcastToServer).toHaveBeenCalledWith(
                SERVER_ID,
                {
                    type: 'emoji_created',
                    payload: {
                        serverId: SERVER_ID,
                        emojiId: EMOJI_ID,
                        emoji: createdEmoji,
                        senderId: USER_ID,
                    },
                },
            );
            expect(mockWsServer.broadcastToServer).toHaveBeenCalledWith(
                SERVER_ID,
                {
                    type: 'emoji_updated',
                    payload: { serverId: SERVER_ID, senderId: USER_ID },
                },
            );
            expect(
                mockServerAuditLogService.createAndBroadcast,
            ).toHaveBeenCalled();
        });

        it('should throw Forbidden if no manageEmojis permission', async () => {
            const req = { user: { id: USER_ID } } as ExpressRequest;
            (mockServerRepo.findById as jest.Mock).mockResolvedValue({
                _id: SERVER_ID,
                ownerId: generateSnowflakeId(),
            });
            (
                mockPermissionService.hasPermission as jest.Mock
            ).mockResolvedValue(false);

            await expect(
                controller.uploadEmoji(
                    SERVER_ID,
                    req.user?.id as string,
                    file,
                    { name: 'test_emoji' },
                ),
            ).rejects.toThrow(ForbiddenException);
        });
    });

    describe('deleteEmoji', () => {
        it('should delete emoji and broadcast emoji_deleted and emoji_updated events', async () => {
            const req = { user: { id: USER_ID } } as ExpressRequest;
            (mockServerRepo.findById as jest.Mock).mockResolvedValue({
                _id: SERVER_ID,
                ownerId: USER_ID,
            });
            (mockEmojiRepo.findById as jest.Mock).mockResolvedValue({
                _id: EMOJI_ID,
                snowflakeId: EMOJI_ID,
                serverId: SERVER_ID,
                name: 'test_emoji',
                imageUrl: 'test.png',
            });

            await controller.deleteEmoji(
                SERVER_ID,
                EMOJI_ID,
                req.user?.id as string,
            );

            expect(mockEmojiRepo.delete).toHaveBeenCalledWith(EMOJI_ID);
            expect(mockWsServer.broadcastToServer).toHaveBeenCalledWith(
                SERVER_ID,
                {
                    type: 'emoji_deleted',
                    payload: {
                        serverId: SERVER_ID,
                        emojiId: EMOJI_ID,
                        senderId: USER_ID,
                    },
                },
            );
            expect(mockWsServer.broadcastToServer).toHaveBeenCalledWith(
                SERVER_ID,
                {
                    type: 'emoji_updated',
                    payload: { serverId: SERVER_ID, senderId: USER_ID },
                },
            );
        });

        it('should throw NotFound if emoji does not exist', async () => {
            const req = { user: { id: USER_ID } } as ExpressRequest;
            (mockServerRepo.findById as jest.Mock).mockResolvedValue({
                _id: SERVER_ID,
                ownerId: USER_ID,
            });
            (mockEmojiRepo.findById as jest.Mock).mockResolvedValue(null);

            await expect(
                controller.deleteEmoji(
                    SERVER_ID,
                    EMOJI_ID,
                    req.user?.id as string,
                ),
            ).rejects.toThrow(NotFoundException);
        });
    });
});
