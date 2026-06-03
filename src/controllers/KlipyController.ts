import {
    Controller,
    Get,
    Post,
    Query,
    Body,
    Req,
    UseGuards,
    Inject,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiOkResponse,
    ApiBearerAuth,
} from '@nestjs/swagger';
import { TYPES } from '@/di/types';
import { KlipyService } from '@/services/KlipyService';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import type { Request as ExpressRequest } from 'express';
import { JWTPayload } from '@/utils/jwt';
import { ToggleFavoriteGifRequestDTO } from '@/controllers/dto/klipy.request.dto';
import {
    FavoriteGifResponseDTO,
    GifMetadataResponseDTO,
    ToggleFavoriteResponseDTO,
} from '@/controllers/dto/klipy.response.dto';
import { KlipySearchResponseDTO } from '@/controllers/dto/klipy-search.response.dto';

@Controller('api/v1/klipy')
@ApiTags('Klipy')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class KlipyController {
    public constructor(
        @Inject(TYPES.KlipyService)
        private klipyService: KlipyService,
    ) {}

    @Get('search')
    @ApiOperation({ summary: 'Search for GIFs on Klipy' })
    @ApiOkResponse({ type: KlipySearchResponseDTO })
    public async search(@Query('q') q: string) {
        return this.klipyService.searchGifs(q);
    }

    @Get('trending')
    @ApiOperation({ summary: 'Get trending GIFs from Klipy' })
    @ApiOkResponse({ type: KlipySearchResponseDTO })
    public async trending() {
        return this.klipyService.getTrendingGifs();
    }

    @Get('stickers/search')
    @ApiOperation({ summary: 'Search for stickers on Klipy' })
    @ApiOkResponse({ type: KlipySearchResponseDTO })
    public async searchStickers(@Query('q') q: string) {
        return this.klipyService.searchStickers(q);
    }

    @Get('stickers/trending')
    @ApiOperation({ summary: 'Get trending stickers from Klipy' })
    @ApiOkResponse({ type: KlipySearchResponseDTO })
    public async trendingStickers() {
        return this.klipyService.getTrendingStickers();
    }

    @Get('resolve')
    @ApiOperation({ summary: 'Resolve Klipy content metadata' })
    @ApiResponse({ status: 200, type: GifMetadataResponseDTO })
    public async resolve(
        @Query('id') id: string,
        @Query('type') type: 'gif' | 'sticker' = 'gif',
    ): Promise<GifMetadataResponseDTO> {
        return this.klipyService.resolveGif(id, type);
    }

    @Get('favorites')
    @ApiOperation({ summary: 'Get user favorite GIFs' })
    @ApiResponse({ status: 200, type: [FavoriteGifResponseDTO] })
    public async getFavorites(
        @Req() req: ExpressRequest,
    ): Promise<FavoriteGifResponseDTO[]> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        return this.klipyService.getFavorites(userId);
    }

    @Post('favorites/toggle')
    @ApiOperation({ summary: 'Toggle GIF in favorites' })
    @ApiResponse({ status: 201, type: ToggleFavoriteResponseDTO })
    public async toggleFavorite(
        @Req() req: ExpressRequest,
        @Body() body: ToggleFavoriteGifRequestDTO,
    ): Promise<ToggleFavoriteResponseDTO> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        return this.klipyService.toggleFavorite(userId, body);
    }
}
