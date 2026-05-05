import { Controller, Get, Param, Req, UseGuards, Inject } from '@nestjs/common';
import { Types } from 'mongoose';
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
import { Request } from 'express';
import { ErrorMessages } from '@/constants/errorMessages';
import { ApiError } from '@/utils/ApiError';
import { JWTPayload } from '@/utils/jwt';
import { injectable } from 'inversify';
import { StickerResponseDTO } from './dto/sticker.response.dto';

interface RequestWithUser extends Request {
    user: JWTPayload;
}



@ApiTags('Stickers')
@injectable()
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
        @Req() req: Request,
    ): Promise<StickerResponseDTO[]> {
        const userId = (req as unknown as RequestWithUser).user.id;
        const userOid = new Types.ObjectId(userId);

        const memberships =
            await this.serverMemberRepo.findAllByUserId(userOid);
        const serverIds = memberships.map((m) => m.serverId);

        const stickers = await this.stickerRepo.findByServerIds(serverIds);
        return stickers.map((s) => ({
            id: s._id.toString(),
            name: s.name,
            imageUrl: s.imageUrl,
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
        const stickerOid = new Types.ObjectId(stickerId);
        const sticker = await this.stickerRepo.findById(stickerOid);
        if (sticker === null) {
            throw new ApiError(404, ErrorMessages.STICKER.NOT_FOUND);
        }

        return {
            id: sticker._id.toString(),
            name: sticker.name,
            imageUrl: sticker.imageUrl,
            serverId: sticker.serverId.toString(),
            createdBy: sticker.createdBy.toString(),
            createdAt: sticker.createdAt,
        };
    }
}
