import {
    Controller,
    Get,
    Param,
    Req,
    UseGuards,
    Inject,
} from '@nestjs/common';
import { TYPES } from '@/di/types';
import { IEmojiRepository } from '@/di/interfaces/IEmojiRepository';
import { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import { ILogger } from '@/di/interfaces/ILogger';
import { ApiTags, ApiResponse, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { Request } from 'express';
import { ErrorMessages } from '@/constants/errorMessages';
import { ApiError } from '@/utils/ApiError';
import { JWTPayload } from '@/utils/jwt';
import { EmojiResponseDTO } from './dto/emoji.response.dto';
import { injectable, inject } from 'inversify';

interface RequestWithUser extends Request {
    user: JWTPayload;
}

// Controller for emoji management
// Provides access to server-specific and global emojis
@ApiTags('Emojis')
@injectable()
@Controller('api/v1/emojis')
export class EmojiController {
    constructor(
        @inject(TYPES.EmojiRepository)
        @Inject(TYPES.EmojiRepository)
        private emojiRepo: IEmojiRepository,
        @inject(TYPES.ServerMemberRepository)
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @inject(TYPES.Logger)
        @Inject(TYPES.Logger)
        private logger: ILogger,
    ) { }

    @Get()
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get all emojis accessible to the user' })
    @ApiResponse({ status: 200, type: [EmojiResponseDTO] })
    public async getAllEmojis(
        @Req() req: Request,
    ): Promise<EmojiResponseDTO[]> {
        const userId = (req as unknown as RequestWithUser).user.id;

        const memberships = await this.serverMemberRepo.findAllByUserId(userId);
        // Extract server IDs from membership objects
        const serverIds = memberships.map((m) => m.serverId.toString());

        const emojis = await this.emojiRepo.findByServerIds(serverIds);
        return emojis.map((e) => ({
            _id: e._id.toString(),
            name: e.name,
            imageUrl: e.imageUrl,
            serverId: e.serverId?.toString() || '', // Handle global emojis if serverId is optional/missing
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
        // Fetch emoji by its unique ID
        const emoji = await this.emojiRepo.findById(emojiId);
        if (!emoji) {
            throw new ApiError(404, ErrorMessages.EMOJI.NOT_FOUND);
        }

        return {
            _id: emoji._id.toString(),
            name: emoji.name,
            imageUrl: emoji.imageUrl,
            serverId: emoji.serverId?.toString() || '',
            createdBy: emoji.createdBy.toString(),
            createdAt: emoji.createdAt,
        };
    }
}
