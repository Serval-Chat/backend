/* eslint-disable @typescript-eslint/no-explicit-any */
import { ServerStickerController } from '../ServerStickerController';
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
        sticker: jest.fn().mockReturnValue({}),
    },
}));

describe('ServerStickerController', () => {
    let controller: ServerStickerController;

    const mockStickerRepo = {
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
        controller = new ServerStickerController(
            mockStickerRepo,
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
    const STICKER_ID = generateSnowflakeId();

    describe('getServerStickers', () => {
        it('should return stickers for a server member', async () => {
            const req = { user: { id: USER_ID } } as ExpressRequest;
            (
                mockServerMemberRepo.findByServerAndUser as jest.Mock
            ).mockResolvedValue({});
            (
                mockStickerRepo.findByServerIdWithCreator as jest.Mock
            ).mockResolvedValue([
                {
                    _id: new Types.ObjectId(),
                    snowflakeId: STICKER_ID,
                    name: 'test',
                    imageUrl: 'url',
                    isAnimated: false,
                    serverId: SERVER_ID,
                    createdBy: USER_ID,
                    createdAt: new Date(),
                },
            ]);

            const result = await controller.getServerStickers(
                SERVER_ID,
                req.user?.id as string,
            );

            expect(result).toHaveLength(1);
            expect(result[0]?.name).toBe('test');
        });

        it('should throw Forbidden if not a member', async () => {
            const req = { user: { id: USER_ID } } as ExpressRequest;
            (
                mockServerMemberRepo.findByServerAndUser as jest.Mock
            ).mockResolvedValue(null);

            await expect(
                controller.getServerStickers(SERVER_ID, req.user?.id as string),
            ).rejects.toThrow(ForbiddenException);
        });
    });

    describe('uploadSticker', () => {
        const file = {
            path: 'temp/path',
            buffer: Buffer.from(''),
            size: 1024,
        } as Express.Multer.File;

        it('should upload sticker if user has permission', async () => {
            const req = { user: { id: USER_ID } } as ExpressRequest;
            (mockServerRepo.findById as jest.Mock).mockResolvedValue({
                _id: SERVER_ID,
                ownerId: generateSnowflakeId(),
            });
            (
                mockPermissionService.hasPermission as jest.Mock
            ).mockResolvedValue(true);
            (
                mockStickerRepo.findByServerAndName as jest.Mock
            ).mockResolvedValue(null);
            (mockStickerRepo.create as jest.Mock).mockResolvedValue({
                _id: new Types.ObjectId(),
                snowflakeId: STICKER_ID,
                name: 'test_sticker',
                imageUrl: '/uploads/stickers/test.png',
                isAnimated: false,
                serverId: SERVER_ID,
                createdBy: USER_ID,
                createdAt: new Date(),
            });
            (
                mockStickerRepo.findByIdWithCreator as jest.Mock
            ).mockResolvedValue({
                _id: new Types.ObjectId(),
                snowflakeId: STICKER_ID,
                name: 'test_sticker',
                imageUrl: '/uploads/stickers/test.png',
                isAnimated: false,
                serverId: SERVER_ID,
                createdBy: USER_ID,
                createdAt: new Date(),
            });

            const result = await controller.uploadSticker(
                SERVER_ID,
                req.user?.id as string,
                file,
                { name: 'test_sticker' },
            );

            expect(result.name).toBe('test_sticker');
            expect(mockWsServer.broadcastToServer).toHaveBeenCalled();
            expect(
                mockServerAuditLogService.createAndBroadcast,
            ).toHaveBeenCalled();
        });

        it('should throw Forbidden if no permission', async () => {
            const req = { user: { id: USER_ID } } as ExpressRequest;
            (mockServerRepo.findById as jest.Mock).mockResolvedValue({
                _id: SERVER_ID,
                ownerId: generateSnowflakeId(),
            });
            (
                mockPermissionService.hasPermission as jest.Mock
            ).mockResolvedValue(false);

            await expect(
                controller.uploadSticker(
                    SERVER_ID,
                    req.user?.id as string,
                    file,
                    {
                        name: 'test',
                    },
                ),
            ).rejects.toThrow(ForbiddenException);
        });

        it('should throw Forbidden before upload work when user is muted', async () => {
            const req = { user: { id: USER_ID } } as ExpressRequest;
            (mockMuteRepo.findActiveByUserId as jest.Mock).mockResolvedValue({
                _id: new Types.ObjectId(),
                userId: USER_ID,
            });

            await expect(
                controller.uploadSticker(
                    SERVER_ID,
                    req.user?.id as string,
                    file,
                    {
                        name: 'test',
                    },
                ),
            ).rejects.toThrow(ForbiddenException);

            expect(mockServerRepo.findById).not.toHaveBeenCalled();
            expect(mockStickerRepo.create).not.toHaveBeenCalled();
        });
    });

    describe('deleteSticker', () => {
        it('should delete sticker if user is owner', async () => {
            const req = { user: { id: USER_ID } } as ExpressRequest;
            (mockServerRepo.findById as jest.Mock).mockResolvedValue({
                _id: SERVER_ID,
                ownerId: USER_ID,
            });
            (mockStickerRepo.findById as jest.Mock).mockResolvedValue({
                _id: STICKER_ID,
                serverId: SERVER_ID,
                name: 'test',
                imageUrl: 'test.png',
                isAnimated: false,
            });

            await controller.deleteSticker(
                SERVER_ID,
                STICKER_ID,
                req.user?.id as string,
            );

            expect(mockStickerRepo.delete).toHaveBeenCalledWith(STICKER_ID);
            expect(mockWsServer.broadcastToServer).toHaveBeenCalled();
        });

        it('should delete sticker if user has manageStickers permission', async () => {
            const req = { user: { id: USER_ID } } as ExpressRequest;
            (mockServerRepo.findById as jest.Mock).mockResolvedValue({
                _id: SERVER_ID,
                ownerId: generateSnowflakeId(),
            });
            (
                mockPermissionService.hasPermission as jest.Mock
            ).mockResolvedValue(true);
            (mockStickerRepo.findById as jest.Mock).mockResolvedValue({
                _id: STICKER_ID,
                serverId: SERVER_ID,
                name: 'test',
                imageUrl: 'test.png',
                isAnimated: false,
            });

            await controller.deleteSticker(
                SERVER_ID,
                STICKER_ID,
                req.user?.id as string,
            );

            expect(mockStickerRepo.delete).toHaveBeenCalled();
        });

        it('should throw Forbidden if no permission to delete', async () => {
            const req = { user: { id: USER_ID } } as ExpressRequest;
            (mockServerRepo.findById as jest.Mock).mockResolvedValue({
                _id: SERVER_ID,
                ownerId: generateSnowflakeId(),
            });
            (
                mockPermissionService.hasPermission as jest.Mock
            ).mockResolvedValue(false);

            await expect(
                controller.deleteSticker(
                    SERVER_ID,
                    STICKER_ID,
                    req.user?.id as string,
                ),
            ).rejects.toThrow(ForbiddenException);
        });

        it('should throw NotFound if sticker does not exist', async () => {
            const req = { user: { id: USER_ID } } as ExpressRequest;
            (mockServerRepo.findById as jest.Mock).mockResolvedValue({
                _id: SERVER_ID,
                ownerId: USER_ID,
            });
            (mockStickerRepo.findById as jest.Mock).mockResolvedValue(null);

            await expect(
                controller.deleteSticker(
                    SERVER_ID,
                    STICKER_ID,
                    req.user?.id as string,
                ),
            ).rejects.toThrow(NotFoundException);
        });
    });
});
