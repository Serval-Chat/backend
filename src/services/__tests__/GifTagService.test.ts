/* eslint-disable @typescript-eslint/no-explicit-any */
import { GifTagService } from '../GifTagService';
import { ErrorMessages } from '@/constants/errorMessages';
import { MAX_TAGS_PER_GIF, MAX_TAGS_PER_USER } from '@/constants/gifTags';
import { GifTagExpressionError } from '@/utils/gifTagExpression';

function queryResult<T>(result: T): Promise<T> & { sort: jest.Mock } {
    const promise = Promise.resolve(result) as Promise<T> & {
        sort: jest.Mock;
    };
    promise.sort = jest.fn().mockReturnValue(promise);
    return promise;
}

describe('GifTagService', () => {
    let service: GifTagService;
    let mockGifTagModel: any;
    let mockFavoriteGifModel: any;

    beforeEach(() => {
        mockGifTagModel = {
            countDocuments: jest.fn(),
            create: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            deleteOne: jest.fn(),
        };
        mockFavoriteGifModel = {
            findOne: jest.fn(),
            findOneAndUpdate: jest.fn(),
            updateMany: jest.fn(),
            find: jest.fn(),
        };

        service = new GifTagService(mockGifTagModel, mockFavoriteGifModel);
    });

    describe('createTag', () => {
        it('creates a tag on the happy path', async () => {
            mockGifTagModel.countDocuments.mockResolvedValue(0);
            const created = {
                snowflakeId: 'tag1',
                name: 'Funny',
                nameLower: 'funny',
            };
            mockGifTagModel.create.mockResolvedValue(created);

            const result = await service.createTag('user1', 'Funny');

            expect(mockGifTagModel.create).toHaveBeenCalledWith({
                ownerId: 'user1',
                name: 'Funny',
                nameLower: 'funny',
            });
            expect(result).toBe(created);
        });

        it('rejects with 409 once the per-user tag limit is reached', async () => {
            mockGifTagModel.countDocuments.mockResolvedValue(MAX_TAGS_PER_USER);

            await expect(service.createTag('user1', 'x')).rejects.toMatchObject(
                {
                    status: 409,
                    message: ErrorMessages.GIF_TAG.MAX_TAGS_REACHED,
                },
            );
            expect(mockGifTagModel.create).not.toHaveBeenCalled();
        });

        it('rejects a case-insensitive duplicate name with 409', async () => {
            mockGifTagModel.countDocuments.mockResolvedValue(0);
            mockGifTagModel.create.mockRejectedValue({ code: 11000 });

            await expect(
                service.createTag('user1', 'Funny'),
            ).rejects.toMatchObject({
                status: 409,
                message: ErrorMessages.GIF_TAG.NAME_EXISTS,
            });
        });

        it('rethrows unexpected errors from the model', async () => {
            mockGifTagModel.countDocuments.mockResolvedValue(0);
            const dbError = new Error('connection lost');
            mockGifTagModel.create.mockRejectedValue(dbError);

            await expect(service.createTag('user1', 'x')).rejects.toBe(dbError);
        });
    });

    describe('listTags', () => {
        it("returns the owner's tags sorted by creation date", async () => {
            const tags = [{ snowflakeId: 't1' }, { snowflakeId: 't2' }];
            mockGifTagModel.find.mockReturnValue(queryResult(tags));

            const result = await service.listTags('user1');

            expect(mockGifTagModel.find).toHaveBeenCalledWith({
                ownerId: 'user1',
            });
            expect(result).toBe(tags);
        });
    });

    describe('deleteTag', () => {
        it('cascades removal from favorites and deletes the tag', async () => {
            mockGifTagModel.findOne.mockResolvedValue({
                snowflakeId: 'tag1',
                ownerId: 'user1',
            });
            mockFavoriteGifModel.updateMany.mockResolvedValue({});
            mockGifTagModel.deleteOne.mockResolvedValue({ deletedCount: 1 });

            const result = await service.deleteTag('tag1', 'user1');

            expect(result).toBe(true);
            expect(mockFavoriteGifModel.updateMany).toHaveBeenCalledWith(
                { userId: 'user1', tagIds: 'tag1' },
                { $pull: { tagIds: 'tag1' } },
            );
            expect(mockGifTagModel.deleteOne).toHaveBeenCalledWith({
                snowflakeId: 'tag1',
                ownerId: 'user1',
            });
        });

        it('returns false and never cascades for a tag the caller does not own', async () => {
            mockGifTagModel.findOne.mockResolvedValue(null);

            const result = await service.deleteTag('tag1', 'attacker');

            expect(result).toBe(false);
            expect(mockFavoriteGifModel.updateMany).not.toHaveBeenCalled();
            expect(mockGifTagModel.deleteOne).not.toHaveBeenCalled();
        });
    });

    describe('addTagsToGif', () => {
        it('adds tags on the happy path', async () => {
            mockFavoriteGifModel.findOne.mockResolvedValue({ tagIds: [] });
            mockGifTagModel.find.mockResolvedValue([
                { snowflakeId: 't1' },
                { snowflakeId: 't2' },
            ]);
            const updated = { tagIds: ['t1', 't2'] };
            mockFavoriteGifModel.findOneAndUpdate.mockResolvedValue(updated);

            const result = await service.addTagsToGif('user1', 'klipy1', [
                't1',
                't2',
            ]);

            expect(result).toBe(updated);
            expect(mockFavoriteGifModel.findOneAndUpdate).toHaveBeenCalledWith(
                { userId: 'user1', klipyId: 'klipy1' },
                { $addToSet: { tagIds: { $each: ['t1', 't2'] } } },
                { returnDocument: 'after' },
            );
        });

        it("404s when the GIF is not in the caller's favorites", async () => {
            mockFavoriteGifModel.findOne.mockResolvedValue(null);

            await expect(
                service.addTagsToGif('user1', 'unknown-klipy', ['t1']),
            ).rejects.toMatchObject({
                status: 404,
                message: ErrorMessages.GIF_TAG.GIF_NOT_FOUND,
            });
        });

        it('400s when a tagId is not owned by the caller (cross-user tampering)', async () => {
            mockFavoriteGifModel.findOne.mockResolvedValue({ tagIds: [] });
            // only one of the two requested ids actually belongs to the user
            mockGifTagModel.find.mockResolvedValue([{ snowflakeId: 't1' }]);

            await expect(
                service.addTagsToGif('user1', 'klipy1', ['t1', 'not-owned']),
            ).rejects.toMatchObject({
                status: 400,
                message: ErrorMessages.GIF_TAG.INVALID_TAG_IDS,
            });
            expect(
                mockFavoriteGifModel.findOneAndUpdate,
            ).not.toHaveBeenCalled();
        });

        it('409s when adding would exceed the max tags per GIF', async () => {
            const existing = Array.from(
                { length: MAX_TAGS_PER_GIF },
                (_, i) => `existing-${i}`,
            );
            mockFavoriteGifModel.findOne.mockResolvedValue({
                tagIds: existing,
            });
            mockGifTagModel.find.mockResolvedValue([{ snowflakeId: 'new' }]);

            await expect(
                service.addTagsToGif('user1', 'klipy1', ['new']),
            ).rejects.toMatchObject({
                status: 409,
                message: ErrorMessages.GIF_TAG.MAX_TAGS_PER_GIF_REACHED,
            });
        });

        it('does not exceed the limit when re-adding tags already on the GIF', async () => {
            const existing = Array.from(
                { length: MAX_TAGS_PER_GIF },
                (_, i) => `existing-${i}`,
            );
            mockFavoriteGifModel.findOne.mockResolvedValue({
                tagIds: existing,
            });
            mockGifTagModel.find.mockResolvedValue([
                { snowflakeId: 'existing-0' },
            ]);
            mockFavoriteGifModel.findOneAndUpdate.mockResolvedValue({
                tagIds: existing,
            });

            await expect(
                service.addTagsToGif('user1', 'klipy1', ['existing-0']),
            ).resolves.toBeDefined();
        });
    });

    describe('removeTagsFromGif', () => {
        it('removes tags on the happy path', async () => {
            const updated = { tagIds: [] };
            mockFavoriteGifModel.findOneAndUpdate.mockResolvedValue(updated);

            const result = await service.removeTagsFromGif('user1', 'klipy1', [
                't1',
            ]);

            expect(result).toBe(updated);
            expect(mockFavoriteGifModel.findOneAndUpdate).toHaveBeenCalledWith(
                { userId: 'user1', klipyId: 'klipy1' },
                { $pullAll: { tagIds: ['t1'] } },
                { returnDocument: 'after' },
            );
        });

        it('404s when the GIF is not owned by the caller', async () => {
            mockFavoriteGifModel.findOneAndUpdate.mockResolvedValue(null);

            await expect(
                service.removeTagsFromGif('attacker', 'klipy1', ['t1']),
            ).rejects.toMatchObject({
                status: 404,
                message: ErrorMessages.GIF_TAG.GIF_NOT_FOUND,
            });
        });
    });

    describe('searchFavorites', () => {
        it('resolves tag names and compiles an AND expression', async () => {
            mockGifTagModel.find.mockResolvedValue([
                { nameLower: 'funny', snowflakeId: 't1' },
                { nameLower: 'silly', snowflakeId: 't2' },
            ]);
            const favorites = [{ klipyId: 'g1' }];
            mockFavoriteGifModel.find.mockReturnValue(queryResult(favorites));

            const result = await service.searchFavorites(
                'user1',
                'funny && silly',
            );

            expect(result).toBe(favorites);
            expect(mockFavoriteGifModel.find).toHaveBeenCalledWith({
                userId: 'user1',
                $and: [{ $and: [{ tagIds: 't1' }, { tagIds: 't2' }] }],
            });
        });

        it('returns an empty array without querying favorites when every tag is unknown', async () => {
            mockGifTagModel.find.mockResolvedValue([]);

            const result = await service.searchFavorites(
                'user1',
                'doesnotexist',
            );

            expect(result).toEqual([]);
            expect(mockFavoriteGifModel.find).not.toHaveBeenCalled();
        });

        it('throws a GifTagExpressionError for a malformed expression', async () => {
            await expect(
                service.searchFavorites('user1', '(unterminated'),
            ).rejects.toThrow(GifTagExpressionError);
            expect(mockGifTagModel.find).not.toHaveBeenCalled();
        });

        it('scopes both lookups to the requesting user', async () => {
            mockGifTagModel.find.mockResolvedValue([
                { nameLower: 'funny', snowflakeId: 't1' },
            ]);
            mockFavoriteGifModel.find.mockReturnValue(queryResult([]));

            await service.searchFavorites('victim', 'funny');

            expect(mockGifTagModel.find).toHaveBeenCalledWith(
                expect.objectContaining({ ownerId: 'victim' }),
            );
            expect(mockFavoriteGifModel.find).toHaveBeenCalledWith(
                expect.objectContaining({ userId: 'victim' }),
            );
        });
    });
});
