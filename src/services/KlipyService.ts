import { Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { injectable } from 'inversify';
import { TYPES } from '@/di/types';
import type { ILogger } from '@/di/interfaces/ILogger';
import { KLIPY_API_KEY } from '@/config/env';
import type { IKlipyCache } from '@/models/KlipyCache';
import type { IFavoriteGif } from '@/models/FavoriteGif';
import type { ToggleFavoriteGifRequestDTO } from '@/controllers/dto/klipy.request.dto';
import type {
    FavoriteGifResponseDTO,
    GifMetadataResponseDTO,
    ToggleFavoriteResponseDTO,
} from '@/controllers/dto/klipy.response.dto';

@injectable()
export class KlipyService {
    private readonly baseUrl = 'https://api.klipy.com/api/v1';

    public constructor(
        @InjectModel('KlipyCache') private klipyCacheModel: Model<IKlipyCache>,
        @InjectModel('FavoriteGif')
        private favoriteGifModel: Model<IFavoriteGif>,
        @Inject(TYPES.Logger) private logger: ILogger,
    ) {}

    private getApiUrl(endpoint: string) {
        return `${this.baseUrl}/${KLIPY_API_KEY}${endpoint}`;
    }

    public async searchGifs(query: string) {
        try {
            const response = await axios.get(this.getApiUrl('/gifs/search'), {
                params: { q: query },
            });
            return response.data;
        } catch (error) {
            this.logger.error(`Failed to search Klipy GIFs: ${error}`);
            throw error;
        }
    }

    public async getTrendingGifs() {
        try {
            const response = await axios.get(this.getApiUrl('/gifs/trending'));
            return response.data;
        } catch (error) {
            this.logger.error(`Failed to get trending Klipy GIFs: ${error}`);
            throw error;
        }
    }

    public async searchStickers(query: string) {
        try {
            const response = await axios.get(
                this.getApiUrl('/stickers/search'),
                {
                    params: { q: query },
                },
            );
            return response.data;
        } catch (error) {
            this.logger.error(`Failed to search Klipy stickers: ${error}`);
            throw error;
        }
    }

    public async getTrendingStickers() {
        try {
            const response = await axios.get(
                this.getApiUrl('/stickers/trending'),
            );
            return response.data;
        } catch (error) {
            this.logger.error(
                `Failed to get trending Klipy stickers: ${error}`,
            );
            throw error;
        }
    }

    public async resolveGif(
        klipyId: string,
        contentType: 'gif' | 'sticker' = 'gif',
    ): Promise<GifMetadataResponseDTO> {
        try {
            return await this.doResolve(klipyId, contentType);
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                const otherType = contentType === 'gif' ? 'sticker' : 'gif';
                try {
                    return await this.doResolve(klipyId, otherType);
                } catch {
                    this.logger.error(
                        `Failed to resolve Klipy content ${klipyId} as either gif or sticker`,
                    );
                    throw error;
                }
            }
            throw error;
        }
    }

    private async doResolve(
        klipyId: string,
        contentType: 'gif' | 'sticker',
    ): Promise<GifMetadataResponseDTO> {
        try {
            const cached = await this.klipyCacheModel.findOne({
                klipyId,
            });
            if (
                cached !== null &&
                typeof cached.slug === 'string' &&
                cached.slug !== ''
            )
                return cached;

            this.logger.info(`Resolving Klipy ${contentType} ${klipyId}`);
            const response = await axios.get(
                this.getApiUrl(
                    `/${contentType === 'gif' ? 'gifs' : 'stickers'}/${klipyId}`,
                ),
            );
            const data = response.data.data as {
                slug?: string;
                file?: {
                    hd?: {
                        gif?: { url: string; width: number; height: number };
                    };
                    md?: {
                        gif?: { url: string; width: number; height: number };
                    };
                    sm?: {
                        gif?: { url: string; width: number; height: number };
                    };
                    xs?: {
                        gif?: { url: string; width: number; height: number };
                    };
                };
            };

            if (data.file === undefined) {
                this.logger.error(
                    `Invalid Klipy response for ${klipyId}: Missing 'file' property in data.`,
                );
                throw new Error('Invalid GIF data received from Klipy');
            }

            const metadata = {
                klipyId,
                slug: data.slug,
                url:
                    data.file.hd?.gif?.url ??
                    data.file.md?.gif?.url ??
                    data.file.sm?.gif?.url ??
                    '',
                previewUrl:
                    data.file.sm?.gif?.url ?? data.file.xs?.gif?.url ?? '',
                width:
                    data.file.hd?.gif?.width ?? data.file.md?.gif?.width ?? 0,
                height:
                    data.file.hd?.gif?.height ?? data.file.md?.gif?.height ?? 0,
                contentType,
                expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
            };

            try {
                return await this.klipyCacheModel.findOneAndUpdate(
                    { klipyId },
                    { $set: metadata },
                    { upsert: true, new: true, setDefaultsOnInsert: true },
                );
            } catch (innerError: unknown) {
                if (
                    typeof innerError === 'object' &&
                    innerError !== null &&
                    'code' in innerError &&
                    innerError.code === 11000
                ) {
                    const existing = await this.klipyCacheModel.findOne({
                        klipyId,
                    });
                    if (existing) return existing;
                }
                throw innerError;
            }
        } catch (error) {
            throw error;
        }
    }

    public async getFavorites(
        userId: string,
    ): Promise<FavoriteGifResponseDTO[]> {
        return this.favoriteGifModel.find({ userId }).lean();
    }

    public async toggleFavorite(
        userId: string,
        gifData: ToggleFavoriteGifRequestDTO,
    ): Promise<ToggleFavoriteResponseDTO> {
        const {
            klipyId,
            url,
            previewUrl,
            width,
            height,
            contentType = 'gif',
        } = gifData;

        const existing = await this.favoriteGifModel.findOne({
            userId,
            klipyId,
        });

        if (existing) {
            await this.favoriteGifModel.deleteOne({ _id: existing._id });
            return { favorited: false };
        } else {
            try {
                await this.favoriteGifModel.create({
                    userId,
                    klipyId,
                    slug: gifData.slug,
                    url,
                    previewUrl,
                    width,
                    height,
                    contentType,
                });
                return { favorited: true };
            } catch (error: unknown) {
                if (
                    typeof error === 'object' &&
                    error !== null &&
                    'code' in error &&
                    error.code === 11000
                ) {
                    await this.favoriteGifModel.deleteOne({
                        userId,
                        klipyId,
                    });
                    return { favorited: false };
                }
                throw error;
            }
        }
    }
}
