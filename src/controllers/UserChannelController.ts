import {
    Controller,
    Post,
    Body,
    UseGuards,
    Inject,
    ForbiddenException,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
} from '@nestjs/swagger';
import { TYPES } from '@/di/types';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type { IFriendshipRepository } from '@/di/interfaces/IFriendshipRepository';
import { ChannelService } from '@/services/ChannelService';
import { CurrentUser } from '@/modules/auth/current-user.decorator';
import { AuthGuard } from '@/modules/auth/auth.module';
import { ErrorMessages } from '@/constants/errorMessages';
import { CreateDmChannelRequestDTO } from './dto/user-channel.request.dto';
import { DmChannelResponseDTO } from './dto/user-channel.response.dto';

@Controller('api/v1/users/@me/channels')
@ApiTags('User Channels')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class UserChannelController {
    public constructor(
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
        @Inject(TYPES.FriendshipRepository)
        private friendshipRepo: IFriendshipRepository,
        @Inject(TYPES.ChannelService)
        private channelService: ChannelService,
    ) {}

    @Post()
    @ApiOperation({ summary: 'Get or create a DM channel with a recipient' })
    @ApiResponse({ status: 201, type: DmChannelResponseDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Recipient not found' })
    public async createDmChannel(
        @CurrentUser('id') userId: string,
        @Body() body: CreateDmChannelRequestDTO,
    ): Promise<DmChannelResponseDTO> {
        const recipient = await this.userRepo.findById(body.recipientId);
        if (recipient === null) {
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }
        const recipientId = recipient.snowflakeId;

        if (recipientId === userId) {
            throw new BadRequestException(ErrorMessages.CHANNEL.CANNOT_DM_SELF);
        }

        if (
            (await this.friendshipRepo.areFriends(userId, recipientId)) !== true
        ) {
            throw new ForbiddenException(ErrorMessages.FRIENDSHIP.NOT_FRIENDS);
        }

        const channel = await this.channelService.getOrCreateDmChannel(
            userId,
            recipientId,
        );

        return {
            id: channel.snowflakeId,
            type: channel.type as 'dm' | 'group_dm',
            recipientIds: channel.recipientIds ?? [],
            createdAt: channel.createdAt.toISOString(),
            lastMessageAt: channel.lastMessageAt
                ? channel.lastMessageAt.toISOString()
                : null,
        };
    }
}
