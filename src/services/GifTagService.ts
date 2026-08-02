import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { injectable } from 'inversify';
import type { IGifTag } from '@/models/GifTag';
import type { IFavoriteGif } from '@/models/FavoriteGif';
import { ApiError } from '@/utils/ApiError';
import { ErrorMessages } from '@/constants/errorMessages';
import { MAX_TAGS_PER_GIF, MAX_TAGS_PER_USER } from '@/constants/gifTags';
import {
    ALWAYS_FALSE,
    collectTagNames,
    compileTagExpression,
    parseTagExpression,
} from '@/utils/gifTagExpression';

function isDuplicateKeyError(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
    );
}

@injectable()
export class GifTagService {
    public constructor(
        @InjectModel('GifTag') private gifTagModel: Model<IGifTag>,
        @InjectModel('FavoriteGif')
        private favoriteGifModel: Model<IFavoriteGif>,
    ) {}

    public async createTag(ownerId: string, name: string): Promise<IGifTag> {
        const count = await this.gifTagModel.countDocuments({ ownerId });
        if (count >= MAX_TAGS_PER_USER) {
            throw new ApiError(409, ErrorMessages.GIF_TAG.MAX_TAGS_REACHED);
        }

        try {
            return await this.gifTagModel.create({
                ownerId,
                name,
                nameLower: name.toLowerCase(),
            });
        } catch (error) {
            if (isDuplicateKeyError(error)) {
                throw new ApiError(409, ErrorMessages.GIF_TAG.NAME_EXISTS);
            }
            throw error;
        }
    }

    public async listTags(ownerId: string): Promise<IGifTag[]> {
        return this.gifTagModel.find({ ownerId }).sort({ createdAt: 1 });
    }

    public async deleteTag(tagId: string, ownerId: string): Promise<boolean> {
        const tag = await this.gifTagModel.findOne({
            snowflakeId: tagId,
            ownerId,
        });
        if (tag === null) return false;

        await this.favoriteGifModel.updateMany(
            { userId: ownerId, tagIds: tagId },
            { $pull: { tagIds: tagId } },
        );

        await this.gifTagModel.deleteOne({ snowflakeId: tagId, ownerId });
        return true;
    }

    public async addTagsToGif(
        ownerId: string,
        klipyId: string,
        tagIds: string[],
    ): Promise<IFavoriteGif> {
        const gif = await this.favoriteGifModel.findOne({
            userId: ownerId,
            klipyId,
        });
        if (gif === null) {
            throw new ApiError(404, ErrorMessages.GIF_TAG.GIF_NOT_FOUND);
        }

        const uniqueRequested = Array.from(new Set(tagIds));
        const owned = await this.gifTagModel.find({
            ownerId,
            snowflakeId: { $in: uniqueRequested },
        });
        if (owned.length !== uniqueRequested.length) {
            throw new ApiError(400, ErrorMessages.GIF_TAG.INVALID_TAG_IDS);
        }

        const resultingSize = new Set([...gif.tagIds, ...uniqueRequested]).size;
        if (resultingSize > MAX_TAGS_PER_GIF) {
            throw new ApiError(
                409,
                ErrorMessages.GIF_TAG.MAX_TAGS_PER_GIF_REACHED,
            );
        }

        const updated = await this.favoriteGifModel.findOneAndUpdate(
            { userId: ownerId, klipyId },
            { $addToSet: { tagIds: { $each: uniqueRequested } } },
            { returnDocument: 'after' },
        );

        if (updated === null) {
            throw new ApiError(404, ErrorMessages.GIF_TAG.GIF_NOT_FOUND);
        }
        return updated;
    }

    public async removeTagsFromGif(
        ownerId: string,
        klipyId: string,
        tagIds: string[],
    ): Promise<IFavoriteGif> {
        const updated = await this.favoriteGifModel.findOneAndUpdate(
            { userId: ownerId, klipyId },
            { $pullAll: { tagIds } },
            { returnDocument: 'after' },
        );

        if (updated === null) {
            throw new ApiError(404, ErrorMessages.GIF_TAG.GIF_NOT_FOUND);
        }
        return updated;
    }

    public async searchFavorites(
        ownerId: string,
        expression: string,
    ): Promise<IFavoriteGif[]> {
        const ast = parseTagExpression(expression);
        const names = Array.from(collectTagNames(ast));

        const tags = await this.gifTagModel.find({
            ownerId,
            nameLower: { $in: names },
        });
        const nameToId = new Map(tags.map((t) => [t.nameLower, t.snowflakeId]));

        const compiled = compileTagExpression(ast, nameToId);
        if (compiled === ALWAYS_FALSE) return [];

        return this.favoriteGifModel
            .find({ userId: ownerId, $and: [compiled] })
            .sort({ createdAt: -1 });
    }
}
