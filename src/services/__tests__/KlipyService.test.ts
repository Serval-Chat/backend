/* eslint-disable @typescript-eslint/no-explicit-any */
import { KlipyService } from '../KlipyService';
import { ErrorMessages } from '@/constants/errorMessages';
import { MAX_FAVORITE_GIFS_PER_USER } from '@/constants/favoriteGifs';

function queryResult<T>(result: T): Promise<T> & { lean: jest.Mock } {
    const promise = Promise.resolve(result) as Promise<T> & {
        lean: jest.Mock;
    };
    promise.lean = jest.fn().mockReturnValue(promise);
    return promise;
}

describe('KlipyService', () => {
    let service: KlipyService;
    let mockKlipyCacheModel: any;
    let mockFavoriteGifModel: any;
    let mockLogger: any;

    const gifPayload = {
        klipyId: 'true-id-1',
        slug: 'funny-cat',
        url: 'https://klipy.com/gifs/funny-cat',
        previewUrl: 'https://media.klipy.com/gifs/funny-cat-preview.gif',
        width: 400,
        height: 300,
        contentType: 'gif' as const,
    };

    beforeEach(() => {
        mockKlipyCacheModel = {
            findOne: jest.fn(),
            findOneAndUpdate: jest.fn(),
        };
        mockFavoriteGifModel = {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            deleteOne: jest.fn(),
            countDocuments: jest.fn(),
        };
        mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
        };

        service = new KlipyService(
            mockKlipyCacheModel,
            mockFavoriteGifModel,
            mockLogger,
        );
    });

    describe('toggleFavorite', () => {
        it('favorites a new GIF on the happy path', async () => {
            mockFavoriteGifModel.findOne.mockResolvedValue(null);
            mockFavoriteGifModel.countDocuments.mockResolvedValue(0);
            mockFavoriteGifModel.create.mockResolvedValue({});

            const result = await service.toggleFavorite('user1', gifPayload);

            expect(result).toEqual({ favorited: true });
            expect(mockFavoriteGifModel.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 'user1',
                    klipyId: gifPayload.klipyId,
                    url: gifPayload.url,
                }),
            );
        });

        it('unfavorites when the exact same klipyId is already favorited', async () => {
            mockFavoriteGifModel.findOne.mockResolvedValue({ _id: 'doc1' });

            const result = await service.toggleFavorite('user1', gifPayload);

            expect(result).toEqual({ favorited: false });
            expect(mockFavoriteGifModel.deleteOne).toHaveBeenCalledWith({
                _id: 'doc1',
            });
            expect(mockFavoriteGifModel.create).not.toHaveBeenCalled();
        });

        it('looks up an existing favorite by klipyId OR url, so a GIF favorited under one klipyId (e.g. a slug from a message) still matches the entry created under the true id', async () => {
            mockFavoriteGifModel.findOne.mockResolvedValue({ _id: 'doc1' });

            const result = await service.toggleFavorite('user1', {
                ...gifPayload,
                klipyId: 'a-different-slug',
            });

            expect(mockFavoriteGifModel.findOne).toHaveBeenCalledWith({
                userId: 'user1',
                $or: [{ klipyId: 'a-different-slug' }, { url: gifPayload.url }],
            });
            expect(result).toEqual({ favorited: false });
            expect(mockFavoriteGifModel.deleteOne).toHaveBeenCalledWith({
                _id: 'doc1',
            });
            expect(mockFavoriteGifModel.create).not.toHaveBeenCalled();
        });

        it('treats a duplicate-key race on create as an unfavorite, deleting by klipyId or url', async () => {
            mockFavoriteGifModel.findOne.mockResolvedValue(null);
            mockFavoriteGifModel.countDocuments.mockResolvedValue(0);
            mockFavoriteGifModel.create.mockRejectedValue({ code: 11000 });

            const result = await service.toggleFavorite('user1', gifPayload);

            expect(result).toEqual({ favorited: false });
            expect(mockFavoriteGifModel.deleteOne).toHaveBeenCalledWith({
                userId: 'user1',
                $or: [{ klipyId: gifPayload.klipyId }, { url: gifPayload.url }],
            });
        });

        it('rejects with 409 once the per-user favorite limit is reached', async () => {
            mockFavoriteGifModel.findOne.mockResolvedValue(null);
            mockFavoriteGifModel.countDocuments.mockResolvedValue(
                MAX_FAVORITE_GIFS_PER_USER,
            );

            await expect(
                service.toggleFavorite('user1', gifPayload),
            ).rejects.toMatchObject({
                status: 409,
                message: ErrorMessages.FAVORITE_GIF.MAX_FAVORITES_REACHED,
            });
            expect(mockFavoriteGifModel.create).not.toHaveBeenCalled();
        });

        it('allows favoriting up to, but not over, the limit', async () => {
            mockFavoriteGifModel.findOne.mockResolvedValue(null);
            mockFavoriteGifModel.countDocuments.mockResolvedValue(
                MAX_FAVORITE_GIFS_PER_USER - 1,
            );
            mockFavoriteGifModel.create.mockResolvedValue({});

            const result = await service.toggleFavorite('user1', gifPayload);

            expect(result).toEqual({ favorited: true });
        });

        it('does not count against the limit when the action is an unfavorite', async () => {
            mockFavoriteGifModel.findOne.mockResolvedValue({ _id: 'doc1' });

            await service.toggleFavorite('user1', gifPayload);

            expect(mockFavoriteGifModel.countDocuments).not.toHaveBeenCalled();
        });

        it('rethrows unexpected errors from create', async () => {
            mockFavoriteGifModel.findOne.mockResolvedValue(null);
            mockFavoriteGifModel.countDocuments.mockResolvedValue(0);
            const dbError = new Error('connection lost');
            mockFavoriteGifModel.create.mockRejectedValue(dbError);

            await expect(
                service.toggleFavorite('user1', gifPayload),
            ).rejects.toBe(dbError);
        });
    });

    describe('getFavorites', () => {
        it('returns the lean list of favorites for the user', async () => {
            const favorites = [{ klipyId: 'x' }];
            mockFavoriteGifModel.find.mockReturnValue(queryResult(favorites));

            const result = await service.getFavorites('user1');

            expect(mockFavoriteGifModel.find).toHaveBeenCalledWith({
                userId: 'user1',
            });
            expect(result).toBe(favorites);
        });
    });
});
