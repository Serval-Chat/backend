import { Controller, Get, Param, Req, UseGuards, Inject } from '@nestjs/common';
import { TYPES } from '@/di/types';
import { IEmojiRepository } from '@/di/interfaces/IEmojiRepository';
import { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import { ILogger } from '@/di/interfaces/ILogger';
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
import { EmojiResponseDTO } from './dto/emoji.response.dto';

@ApiTags('Emojis')
@Controller('api/v1/emojis')
export class EmojiController {
    public constructor(
        @Inject(TYPES.EmojiRepository)
        private emojiRepo: IEmojiRepository,
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @Inject(TYPES.Logger)
        private logger: ILogger,
    ) {}

    @Get()
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get all emojis accessible to the user' })
    @ApiResponse({ status: 200, type: [EmojiResponseDTO] })
    public async getAllEmojis(
        @Req() req: AuthenticatedRequest,
    ): Promise<EmojiResponseDTO[]> {
        const userId = req.user.id;
        const memberships = await this.serverMemberRepo.findAllByUserId(userId);
        const serverIds = memberships.map((m) => m.serverId);

        const emojis = await this.emojiRepo.findByServerIds(serverIds);
        return emojis.map((e) => ({
            id: e.snowflakeId,
            name: e.name,
            imageUrl: e.imageUrl,
            serverId: e.serverId.toString(),
            createdBy: e.createdBy.toString(),
            createdAt: e.createdAt,
        }));
    }

    @Get(':emojiId')
    @ApiOperation({ summary: 'Get a specific emoji by ID' })
    @ApiResponse({ status: 200, type: EmojiResponseDTO })
    @ApiResponse({ status: 404, description: 'Emoji Not Found' })
    public async getEmojiById(
        @Param('emojiId') emojiId: string,
    ): Promise<EmojiResponseDTO> {
        const emoji = await this.emojiRepo.findById(emojiId);
        if (emoji === null) {
            throw new ApiError(404, ErrorMessages.EMOJI.NOT_FOUND);
        }

        return {
            id: emoji.snowflakeId,
            name: emoji.name,
            imageUrl: emoji.imageUrl,
            serverId: emoji.serverId.toString(),
            createdBy: emoji.createdBy.toString(),
            createdAt: emoji.createdAt,
        };
    }
}
