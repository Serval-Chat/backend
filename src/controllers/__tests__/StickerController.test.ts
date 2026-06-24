/* eslint-disable @typescript-eslint/no-explicit-any */
import { StickerController } from '../StickerController';
import { Types } from 'mongoose';
import { ErrorMessages } from '@/constants/errorMessages';
import { generateSnowflakeId } from '@/utils/snowflake';
import type { AuthenticatedRequest } from '@/middleware/auth';

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

describe('StickerController', () => {
    let controller: StickerController;

    const mockStickerRepo = {
        findById: jest.fn(),
        findByServerIds: jest.fn(),
    } as any;

    const mockServerMemberRepo = {
        findAllByUserId: jest.fn(),
    } as any;

    beforeEach(() => {
        controller = new StickerController(
            mockStickerRepo,
            mockServerMemberRepo,
        );
        jest.clearAllMocks();
    });

    const STICKER_ID = generateSnowflakeId();

    describe('getStickerById', () => {
        it('should return a sticker by ID', async () => {
            const sticker = {
                _id: new Types.ObjectId(),
                snowflakeId: STICKER_ID,
                name: 'test',
                imageUrl: 'url',
                serverId: generateSnowflakeId(),
                createdBy: generateSnowflakeId(),
                createdAt: new Date(),
            };
            (mockStickerRepo.findById as jest.Mock).mockResolvedValue(sticker);

            const result = await controller.getStickerById(STICKER_ID);

            expect(result.id).toBe(STICKER_ID);
            expect(result.name).toBe('test');
        });

        it('should throw ApiError if sticker not found', async () => {
            (mockStickerRepo.findById as jest.Mock).mockResolvedValue(null);

            await expect(controller.getStickerById(STICKER_ID)).rejects.toThrow(
                expect.objectContaining({
                    message: ErrorMessages.STICKER.NOT_FOUND,
                    status: 404,
                }),
            );
        });
    });

    describe('getAllStickers', () => {
        it('should return stickers for all user servers', async () => {
            const userId = generateSnowflakeId();
            const serverId = generateSnowflakeId();
            const req = {
                user: { id: userId },
            } as AuthenticatedRequest;

            (
                mockServerMemberRepo.findAllByUserId as jest.Mock
            ).mockResolvedValue([{ serverId }]);
            (mockStickerRepo.findByServerIds as jest.Mock).mockResolvedValue([
                {
                    _id: new Types.ObjectId(),
                    snowflakeId: generateSnowflakeId(),
                    name: 'test',
                    imageUrl: 'url',
                    serverId: serverId,
                    createdBy: generateSnowflakeId(),
                    createdAt: new Date(),
                },
            ]);

            const result = await controller.getAllStickers(req);

            expect(result).toHaveLength(1);
            expect(result[0]?.name).toBe('test');
        });
    });
});
