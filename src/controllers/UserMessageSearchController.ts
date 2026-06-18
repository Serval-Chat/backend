import {
    Controller,
    Get,
    Inject,
    Query,
    Req,
    UseGuards,
    ForbiddenException,
    ServiceUnavailableException,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOperation,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { TYPES } from '@/di/types';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { NoBot } from '@/modules/auth/bot.decorator';
import type { IFriendshipRepository } from '@/di/interfaces/IFriendshipRepository';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type {
    IMessageSearchService,
    SearchFilters,
} from '@/di/interfaces/IMessageSearchService';
import { DmMessageSearchQueryDTO } from './dto/message-search.request.dto';
import { DmMessageSearchResponseDTO } from './dto/message-search.response.dto';
import type { Request as ExpressRequest } from 'express';
import { JWTPayload } from '@/utils/jwt';
import { Types } from 'mongoose';
import { ErrorMessages } from '@/constants/errorMessages';

@Controller('api/v1/messages')
@ApiTags('Message Search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@NoBot()
export class UserMessageSearchController {
    public constructor(
        @Inject(TYPES.MessageSearchService)
        private searchService: IMessageSearchService,
        @Inject(TYPES.FriendshipRepository)
        private friendshipRepo: IFriendshipRepository,
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
    ) {}

    @Get('search')
    @ApiOperation({ summary: 'Search DM messages with a user' })
    @ApiResponse({ status: 200, type: DmMessageSearchResponseDTO })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.FRIENDSHIP.NOT_FRIENDS,
    })
    @ApiResponse({ status: 503, description: 'Search service unavailable' })
    public async searchMessages(
        @Query() query: DmMessageSearchQueryDTO,
        @Req() req: ExpressRequest,
    ): Promise<DmMessageSearchResponseDTO> {
        const meId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const {
            userId: otherUserId,
            q,
            limit,
            offset,
            fromUser,
            mentionsUser,
            authorType,
            hasFile,
            hasEmbed,
            hasLink,
            before,
            after,
            strict,
            notFromUser,
            notMentionsUser,
            notAuthorType,
            notIsPinned,
            notHasFile,
            notHasEmbed,
            notHasLink,
            notStrict,
        } = query;

        const friends = await this.friendshipRepo.areFriends(
            new Types.ObjectId(meId),
            new Types.ObjectId(otherUserId),
        );
        if (friends !== true) {
            throw new ForbiddenException(ErrorMessages.FRIENDSHIP.NOT_FRIENDS);
        }

        const filters: SearchFilters = {
            authorType,
            hasFile,
            hasEmbed,
            hasLink,
            before,
            after,
            strict,
            notAuthorType,
            notIsPinned,
            notHasFile,
            notHasEmbed,
            notHasLink,
            notStrict,
        };

        // resolve from: username -> userId
        if (fromUser !== undefined && fromUser !== '') {
            const sender = await this.userRepo.findByUsername(fromUser);
            if (!sender) return { hits: [], total: 0 };
            filters.fromUserId = sender._id.toString();
        }

        // resolve mentions: username -> userId
        if (mentionsUser !== undefined && mentionsUser !== '') {
            const mentioned = await this.userRepo.findByUsername(mentionsUser);
            if (!mentioned) return { hits: [], total: 0 };
            filters.mentionsUserId = mentioned._id.toString();
        }

        // resolve negated from: username -> userId
        if (notFromUser !== undefined && notFromUser !== '') {
            const sender = await this.userRepo.findByUsername(notFromUser);
            if (sender) filters.notFromUserId = sender._id.toString();
        }

        // resolve negated mentions: username -> userId
        if (notMentionsUser !== undefined && notMentionsUser !== '') {
            const mentioned =
                await this.userRepo.findByUsername(notMentionsUser);
            if (mentioned) filters.notMentionsUserId = mentioned._id.toString();
        }

        try {
            return await this.searchService.searchDmMessages(
                meId,
                otherUserId,
                q,
                limit,
                offset,
                filters,
            );
        } catch {
            throw new ServiceUnavailableException('Search service unavailable');
        }
    }
}
