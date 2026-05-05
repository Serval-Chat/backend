import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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

@Injectable()
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
        return `${this.baseUrl}${endpoint}`;
    }

    public async searchGifs(query: string) {
        try {
            const response = await axios.get(this.getApiUrl('/gifs/search'), {
                params: { q: query },
                headers: { 'Authorization': `Bearer ${KLIPY_API_KEY}` }
            });
            return response.data;
        } catch (error) {
            this.logger.error(`Failed to search Klipy GIFs: ${error}`);
            throw error;
        }
    }

    public async getTrendingGifs() {
        try {
            const response = await axios.get(this.getApiUrl('/gifs/trending'), {
                headers: { 'Authorization': `Bearer ${KLIPY_API_KEY}` }
            });
            return response.data;
        } catch (error) {
            this.logger.error(`Failed to get trending Klipy GIFs: ${error}`);
            throw error;
        }
    }

    public async resolveGif(klipyId: string): Promise<GifMetadataResponseDTO> {
        try {
            const cached = await this.klipyCacheModel.findOne({ klipyId });
            if (cached) return cached;

            this.logger.info(`Resolving Klipy GIF ${klipyId}`);
            const response = await axios.get(
                this.getApiUrl(`/gifs/${klipyId}`),
                { headers: { 'Authorization': `Bearer ${KLIPY_API_KEY}` } }
            );
            const data = response.data.data as {
                file?: {
                    hd?: { gif?: { url: string; width: number; height: number } };
                    md?: { gif?: { url: string; width: number; height: number } };
                    sm?: { gif?: { url: string; width: number; height: number } };
                    xs?: { gif?: { url: string; width: number; height: number } };
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
                url:
                    (data.file.hd?.gif?.url as string | undefined) ??
                    (data.file.md?.gif?.url as string | undefined) ??
                    (data.file.sm?.gif?.url as string | undefined) ??
                    '',
                previewUrl: (data.file.sm?.gif?.url as string | undefined) ?? (data.file.xs?.gif?.url as string | undefined) ?? '',
                width:
                    (data.file.hd?.gif?.width as number | undefined) ?? (data.file.md?.gif?.width as number | undefined) ?? 0,
                height:
                    (data.file.hd?.gif?.height as number | undefined) ?? (data.file.md?.gif?.height as number | undefined) ?? 0,
                expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
            };

            return await this.klipyCacheModel.findOneAndUpdate(
                { klipyId },
                { $set: metadata },
                { upsert: true, new: true, setDefaultsOnInsert: true },
            );
        } catch (error) {
            this.logger.error(
                `Failed to resolve Klipy GIF ${klipyId}: ${error}`,
            );
            throw error;
        }
    }

    public async getFavorites(
        userId: string,
    ): Promise<FavoriteGifResponseDTO[]> {
        return this.favoriteGifModel
            .find({ userId: new Types.ObjectId(userId) })
            .lean();
    }

    public async toggleFavorite(
        userId: string,
        gifData: ToggleFavoriteGifRequestDTO,
    ): Promise<ToggleFavoriteResponseDTO> {
        const userOid = new Types.ObjectId(userId);
        const { klipyId, url, previewUrl, width, height } = gifData;

        const existing = await this.favoriteGifModel.findOne({
            userId: userOid,
            klipyId,
        });

        if (existing) {
            await this.favoriteGifModel.deleteOne({ _id: existing._id });
            return { favorited: false };
        } else {
            await this.favoriteGifModel.create({
                userId: userOid,
                klipyId,
                url,
                previewUrl,
                width,
                height,
            });
            return { favorited: true };
        }
    }
}
