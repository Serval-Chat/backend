import { StickerController } from '../StickerController';
import { Types } from 'mongoose';
import type { IStickerRepository } from '@/di/interfaces/IStickerRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import { ErrorMessages } from '@/constants/errorMessages';
import type { Request } from 'express';

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
}));

describe('StickerController', () => {
    let controller: StickerController;

    const mockStickerRepo = {
        findById: jest.fn(),
        findByServerIds: jest.fn(),
    } as unknown as IStickerRepository;

    const mockServerMemberRepo = {
        findAllByUserId: jest.fn(),
    } as unknown as IServerMemberRepository;

    beforeEach(() => {
        controller = new StickerController(
            mockStickerRepo,
            mockServerMemberRepo,
        );
        jest.clearAllMocks();
    });

    const STICKER_ID = new Types.ObjectId().toHexString();

    describe('getStickerById', () => {
        it('should return a sticker by ID', async () => {
            const sticker = {
                _id: new Types.ObjectId(STICKER_ID),
                name: 'test',
                imageUrl: 'url',
                serverId: new Types.ObjectId(),
                createdBy: new Types.ObjectId(),
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
            const userId = new Types.ObjectId().toHexString();
            const serverId = new Types.ObjectId();
            const req = { user: { id: userId } } as unknown as Request;

            (
                mockServerMemberRepo.findAllByUserId as jest.Mock
            ).mockResolvedValue([{ serverId }]);
            (mockStickerRepo.findByServerIds as jest.Mock).mockResolvedValue([
                {
                    _id: new Types.ObjectId(),
                    name: 'test',
                    imageUrl: 'url',
                    serverId: serverId,
                    createdBy: new Types.ObjectId(),
                    createdAt: new Date(),
                },
            ]);

            const result = await controller.getAllStickers(req);

            expect(result).toHaveLength(1);
            expect(result[0]?.name).toBe('test');
        });
    });
});
