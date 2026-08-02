/* eslint-disable @typescript-eslint/no-explicit-any */
import { GifTagController } from '../GifTagController';
import { ApiError } from '@/utils/ApiError';
import { ErrorMessages } from '@/constants/errorMessages';
import { GifTagExpressionError } from '@/utils/gifTagExpression';
import { generateSnowflakeId } from '@/utils/snowflake';

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

describe('GifTagController', () => {
    let controller: GifTagController;

    const mockService = {
        listTags: jest.fn(),
        createTag: jest.fn(),
        deleteTag: jest.fn(),
        addTagsToGif: jest.fn(),
        removeTagsFromGif: jest.fn(),
        searchFavorites: jest.fn(),
    } as any;

    beforeEach(() => {
        controller = new GifTagController(mockService);
        jest.clearAllMocks();
    });

    const USER_ID = generateSnowflakeId();
    const TAG_ID = generateSnowflakeId();

    describe('listTags', () => {
        it('maps tags to the response DTO', async () => {
            const now = new Date();
            mockService.listTags.mockResolvedValue([
                {
                    snowflakeId: TAG_ID,
                    name: 'funny',
                    createdAt: now,
                    updatedAt: now,
                },
            ]);

            const result = await controller.listTags(USER_ID);

            expect(mockService.listTags).toHaveBeenCalledWith(USER_ID);
            expect(result).toEqual([
                { id: TAG_ID, name: 'funny', createdAt: now, updatedAt: now },
            ]);
        });
    });

    describe('createTag', () => {
        it('delegates to the service and maps the response', async () => {
            const now = new Date();
            mockService.createTag.mockResolvedValue({
                snowflakeId: TAG_ID,
                name: 'funny',
                createdAt: now,
                updatedAt: now,
            });

            const result = await controller.createTag(USER_ID, {
                name: 'funny',
            });

            expect(mockService.createTag).toHaveBeenCalledWith(
                USER_ID,
                'funny',
            );
            expect(result.id).toBe(TAG_ID);
        });

        it('propagates a 409 ApiError from the service', async () => {
            mockService.createTag.mockRejectedValue(
                new ApiError(409, ErrorMessages.GIF_TAG.NAME_EXISTS),
            );

            await expect(
                controller.createTag(USER_ID, { name: 'funny' }),
            ).rejects.toMatchObject({ status: 409 });
        });
    });

    describe('deleteTag', () => {
        it('returns a confirmation message when deleted', async () => {
            mockService.deleteTag.mockResolvedValue(true);

            const result = await controller.deleteTag(USER_ID, TAG_ID);

            expect(mockService.deleteTag).toHaveBeenCalledWith(TAG_ID, USER_ID);
            expect(result).toEqual({ message: 'Tag deleted' });
        });

        it('throws 404 when the tag does not exist or is not owned', async () => {
            mockService.deleteTag.mockResolvedValue(false);

            await expect(
                controller.deleteTag(USER_ID, TAG_ID),
            ).rejects.toMatchObject({
                status: 404,
                message: ErrorMessages.GIF_TAG.NOT_FOUND,
            });
        });
    });

    describe('addTagsToGif', () => {
        it('delegates to the service and maps the favorite DTO', async () => {
            mockService.addTagsToGif.mockResolvedValue({
                klipyId: 'klipy1',
                url: 'https://example.com/g.gif',
                previewUrl: 'https://example.com/p.gif',
                width: 100,
                height: 100,
                contentType: 'gif',
                tagIds: [TAG_ID],
            });

            const result = await controller.addTagsToGif(USER_ID, 'klipy1', {
                tagIds: [TAG_ID],
            });

            expect(mockService.addTagsToGif).toHaveBeenCalledWith(
                USER_ID,
                'klipy1',
                [TAG_ID],
            );
            expect(result.tagIds).toEqual([TAG_ID]);
        });

        it('propagates 404 for a GIF that is not favorited', async () => {
            mockService.addTagsToGif.mockRejectedValue(
                new ApiError(404, ErrorMessages.GIF_TAG.GIF_NOT_FOUND),
            );

            await expect(
                controller.addTagsToGif(USER_ID, 'unknown', {
                    tagIds: [TAG_ID],
                }),
            ).rejects.toMatchObject({ status: 404 });
        });

        it('propagates 400 for tag ids the caller does not own', async () => {
            mockService.addTagsToGif.mockRejectedValue(
                new ApiError(400, ErrorMessages.GIF_TAG.INVALID_TAG_IDS),
            );

            await expect(
                controller.addTagsToGif(USER_ID, 'klipy1', {
                    tagIds: ['not-owned'],
                }),
            ).rejects.toMatchObject({ status: 400 });
        });
    });

    describe('removeTagsFromGif', () => {
        it('delegates to the service', async () => {
            mockService.removeTagsFromGif.mockResolvedValue({
                klipyId: 'klipy1',
                url: 'u',
                previewUrl: 'p',
                width: 1,
                height: 1,
                contentType: 'gif',
                tagIds: [],
            });

            const result = await controller.removeTagsFromGif(
                USER_ID,
                'klipy1',
                { tagIds: [TAG_ID] },
            );

            expect(mockService.removeTagsFromGif).toHaveBeenCalledWith(
                USER_ID,
                'klipy1',
                [TAG_ID],
            );
            expect(result.tagIds).toEqual([]);
        });
    });

    describe('searchFavorites', () => {
        it('returns matching favorites mapped to DTOs', async () => {
            mockService.searchFavorites.mockResolvedValue([
                {
                    klipyId: 'klipy1',
                    url: 'u',
                    previewUrl: 'p',
                    width: 1,
                    height: 1,
                    contentType: 'gif',
                    tagIds: [TAG_ID],
                },
            ]);

            const result = await controller.searchFavorites(USER_ID, {
                expression: 'funny',
            });

            expect(mockService.searchFavorites).toHaveBeenCalledWith(
                USER_ID,
                'funny',
            );
            expect(result).toHaveLength(1);
        });

        it('converts a GifTagExpressionError into a 400 ApiError', async () => {
            mockService.searchFavorites.mockRejectedValue(
                new GifTagExpressionError('Unbalanced parentheses'),
            );

            await expect(
                controller.searchFavorites(USER_ID, {
                    expression: '(unterminated',
                }),
            ).rejects.toMatchObject({
                status: 400,
                message: 'Unbalanced parentheses',
            });
        });

        it('rethrows unrelated errors unchanged', async () => {
            const dbError = new Error('db down');
            mockService.searchFavorites.mockRejectedValue(dbError);

            await expect(
                controller.searchFavorites(USER_ID, { expression: 'funny' }),
            ).rejects.toBe(dbError);
        });
    });
});
