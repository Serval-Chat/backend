import { Controller, Get, Param, Req, UseGuards, Inject } from '@nestjs/common';
import { TYPES } from '@/di/types';
import { IStickerRepository } from '@/di/interfaces/IStickerRepository';
import { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import {
    ApiTags,
    ApiResponse,
    ApiBearerAuth,
    ApiOperation,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import type { AuthenticatedRequest } from '@/middleware/auth';
import { ErrorMessages } from '@/constants/errorMessages';
import { ApiError } from '@/utils/ApiError';
import { StickerResponseDTO } from './dto/sticker.response.dto';

@ApiTags('Stickers')
@Controller('api/v1/stickers')
export class StickerController {
    public constructor(
        @Inject(TYPES.StickerRepository)
        private stickerRepo: IStickerRepository,
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
    ) {}

    @Get()
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get all stickers accessible to the user' })
    @ApiResponse({ status: 200, type: [StickerResponseDTO] })
    public async getAllStickers(
        @Req() req: AuthenticatedRequest,
    ): Promise<StickerResponseDTO[]> {
        const userId = req.user.id;
        const memberships = await this.serverMemberRepo.findAllByUserId(userId);
        const serverIds = memberships.map((m) => m.serverId);

        const stickers = await this.stickerRepo.findByServerIds(serverIds);
        return stickers.map((s) => ({
            id: s.snowflakeId,
            name: s.name,
            imageUrl: s.imageUrl,
            isAnimated: s.isAnimated,
            serverId: s.serverId.toString(),
            createdBy: s.createdBy.toString(),
            createdAt: s.createdAt,
        }));
    }

    @Get(':stickerId')
    @ApiOperation({ summary: 'Get a specific sticker by ID' })
    @ApiResponse({ status: 200, type: StickerResponseDTO })
    @ApiResponse({ status: 404, description: 'Sticker Not Found' })
    public async getStickerById(
        @Param('stickerId') stickerId: string,
    ): Promise<StickerResponseDTO> {
        const sticker = await this.stickerRepo.findById(stickerId);
        if (sticker === null) {
            throw new ApiError(404, ErrorMessages.STICKER.NOT_FOUND);
        }

        return {
            id: sticker.snowflakeId,
            name: sticker.name,
            imageUrl: sticker.imageUrl,
            isAnimated: sticker.isAnimated,
            serverId: sticker.serverId.toString(),
            createdBy: sticker.createdBy.toString(),
            createdAt: sticker.createdAt,
        };
    }
}
