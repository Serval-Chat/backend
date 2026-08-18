import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Inject,
    Param,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOkResponse,
    ApiOperation,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { TYPES } from '@/di/types';
import { GifTagService } from '@/services/GifTagService';
import { AuthGuard } from '@/modules/auth/auth.module';
import { CurrentUser } from '@/modules/auth/current-user.decorator';
import { ApiError } from '@/utils/ApiError';
import { ErrorMessages } from '@/constants/errorMessages';
import { GifTagExpressionError } from '@/utils/gifTagExpression';
import type { IGifTag } from '@/models/GifTag';
import type { IFavoriteGif } from '@/models/FavoriteGif';
import {
    CreateGifTagRequestDTO,
    GifTagIdsRequestDTO,
    SearchFavoriteGifsByTagRequestDTO,
} from '@/controllers/dto/gifTag.request.dto';
import { GifTagResponseDTO } from '@/controllers/dto/gifTag.response.dto';
import { FavoriteGifResponseDTO } from '@/controllers/dto/klipy.response.dto';

function toTagDTO(tag: IGifTag): GifTagResponseDTO {
    return {
        id: tag.snowflakeId,
        name: tag.name,
        createdAt: tag.createdAt,
        updatedAt: tag.updatedAt,
    };
}

function toFavoriteDTO(gif: IFavoriteGif): FavoriteGifResponseDTO {
    return {
        klipyId: gif.klipyId,
        slug: gif.slug,
        url: gif.url,
        previewUrl: gif.previewUrl,
        width: gif.width,
        height: gif.height,
        contentType: gif.contentType,
        tagIds: gif.tagIds,
    };
}

@Controller('api/v1/gif-tags')
@ApiTags('GifTags')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class GifTagController {
    public constructor(
        @Inject(TYPES.GifTagService)
        private gifTagService: GifTagService,
    ) {}

    @Get()
    @ApiOperation({ summary: "List the current user's GIF tags" })
    @ApiOkResponse({ type: [GifTagResponseDTO] })
    public async listTags(
        @CurrentUser('id') userId: string,
    ): Promise<GifTagResponseDTO[]> {
        const tags = await this.gifTagService.listTags(userId);
        return tags.map(toTagDTO);
    }

    @Post()
    @ApiOperation({ summary: 'Create a new GIF tag' })
    @ApiResponse({ status: 201, type: GifTagResponseDTO })
    @ApiResponse({ status: 409, description: 'Tag name already exists' })
    public async createTag(
        @CurrentUser('id') userId: string,
        @Body() body: CreateGifTagRequestDTO,
    ): Promise<GifTagResponseDTO> {
        const tag = await this.gifTagService.createTag(userId, body.name);
        return toTagDTO(tag);
    }

    @Delete(':tagId')
    @HttpCode(200)
    @ApiOperation({ summary: 'Delete a GIF tag and clear its associations' })
    @ApiOkResponse({ description: 'Tag deleted' })
    @ApiResponse({ status: 404, description: 'Tag not found' })
    public async deleteTag(
        @CurrentUser('id') userId: string,
        @Param('tagId') tagId: string,
    ): Promise<{ message: string }> {
        const deleted = await this.gifTagService.deleteTag(tagId, userId);
        if (!deleted) {
            throw new ApiError(404, ErrorMessages.GIF_TAG.NOT_FOUND);
        }
        return { message: 'Tag deleted' };
    }

    @Get('search')
    @ApiOperation({
        summary: 'Search favorited GIFs using a boolean tag expression',
    })
    @ApiOkResponse({ type: [FavoriteGifResponseDTO] })
    @ApiResponse({ status: 400, description: 'Malformed tag expression' })
    public async searchFavorites(
        @CurrentUser('id') userId: string,
        @Query() query: SearchFavoriteGifsByTagRequestDTO,
    ): Promise<FavoriteGifResponseDTO[]> {
        try {
            const gifs = await this.gifTagService.searchFavorites(
                userId,
                query.expression,
            );
            return gifs.map(toFavoriteDTO);
        } catch (error) {
            if (error instanceof GifTagExpressionError) {
                throw new ApiError(400, error.message);
            }
            throw error;
        }
    }

    @Post('gifs/:klipyId')
    @ApiOperation({ summary: 'Add one or more tags to a favorited GIF' })
    @ApiResponse({ status: 201, type: FavoriteGifResponseDTO })
    @ApiResponse({ status: 404, description: 'Favorited GIF not found' })
    public async addTagsToGif(
        @CurrentUser('id') userId: string,
        @Param('klipyId') klipyId: string,
        @Body() body: GifTagIdsRequestDTO,
    ): Promise<FavoriteGifResponseDTO> {
        const gif = await this.gifTagService.addTagsToGif(
            userId,
            klipyId,
            body.tagIds,
        );
        return toFavoriteDTO(gif);
    }

    @Delete('gifs/:klipyId')
    @ApiOperation({ summary: 'Remove one or more tags from a favorited GIF' })
    @ApiOkResponse({ type: FavoriteGifResponseDTO })
    @ApiResponse({ status: 404, description: 'Favorited GIF not found' })
    public async removeTagsFromGif(
        @CurrentUser('id') userId: string,
        @Param('klipyId') klipyId: string,
        @Body() body: GifTagIdsRequestDTO,
    ): Promise<FavoriteGifResponseDTO> {
        const gif = await this.gifTagService.removeTagsFromGif(
            userId,
            klipyId,
            body.tagIds,
        );
        return toFavoriteDTO(gif);
    }
}
