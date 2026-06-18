import {
    Controller,
    Get,
    Inject,
    Param,
    Query,
    Req,
    UseGuards,
    ForbiddenException,
    NotFoundException,
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
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IChannelRepository } from '@/di/interfaces/IChannelRepository';
import type { ICategoryRepository } from '@/di/interfaces/ICategoryRepository';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type {
    IMessageSearchService,
    SearchFilters,
} from '@/di/interfaces/IMessageSearchService';
import { PermissionService } from '@/permissions/PermissionService';
import { ChannelMessageSearchQueryDTO } from './dto/message-search.request.dto';
import { ChannelMessageSearchResponseDTO } from './dto/message-search.response.dto';
import type { Request as ExpressRequest } from 'express';
import { JWTPayload } from '@/utils/jwt';
import mongoose from 'mongoose';
import { ErrorMessages } from '@/constants/errorMessages';

@Controller('api/v1/servers/:serverId/channels/:channelId/messages')
@ApiTags('Message Search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@NoBot()
export class ServerMessageSearchController {
    public constructor(
        @Inject(TYPES.MessageSearchService)
        private searchService: IMessageSearchService,
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @Inject(TYPES.ChannelRepository)
        private channelRepo: IChannelRepository,
        @Inject(TYPES.CategoryRepository)
        private categoryRepo: ICategoryRepository,
        @Inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
    ) {}

    @Get('search')
    @ApiOperation({ summary: 'Search messages in a server channel' })
    @ApiResponse({ status: 200, type: ChannelMessageSearchResponseDTO })
    @ApiResponse({ status: 403, description: ErrorMessages.SERVER.NOT_MEMBER })
    @ApiResponse({ status: 404, description: ErrorMessages.CHANNEL.NOT_FOUND })
    @ApiResponse({ status: 503, description: 'Search service unavailable' })
    public async searchMessages(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Query() query: ChannelMessageSearchQueryDTO,
        @Req() req: ExpressRequest,
    ): Promise<ChannelMessageSearchResponseDTO> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const {
            q,
            limit,
            offset,
            fromUser,
            mentionsUser,
            authorType,
            isPinned,
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
            inChannel,
            inCategory,
            notInCategory,
        } = query;

        const member = await this.serverMemberRepo.findByServerAndUser(
            new mongoose.Types.ObjectId(serverId),
            new mongoose.Types.ObjectId(userId),
        );
        if (member === null) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const channel = await this.channelRepo.findById(
            new mongoose.Types.ObjectId(channelId),
        );
        if (channel === null || channel.serverId.toString() !== serverId) {
            throw new NotFoundException(ErrorMessages.CHANNEL.NOT_FOUND);
        }
        if (channel.type === 'link') {
            throw new ForbiddenException(
                'Cannot search messages in a link channel',
            );
        }

        const canView = await this.permissionService.hasChannelPermission(
            new mongoose.Types.ObjectId(serverId),
            new mongoose.Types.ObjectId(userId),
            new mongoose.Types.ObjectId(channelId),
            'viewChannels',
        );
        if (canView !== true) {
            throw new ForbiddenException(ErrorMessages.CHANNEL.NOT_FOUND);
        }

        // build the positive channel scope from inChannel + inCategory chips.
        // if neither is specified we fall back to the URL channelId.
        let searchChannelId: string | string[] = channelId;
        const hasPositiveScope =
            (inChannel !== undefined && inChannel.length > 0) ||
            (inCategory !== undefined && inCategory.length > 0);

        if (
            hasPositiveScope ||
            (notInCategory !== undefined && notInCategory.length > 0)
        ) {
            // fetch all server channels once; needed for category expansion
            const allServerChannels = await this.channelRepo.findByServerId(
                new mongoose.Types.ObjectId(serverId),
            );

            const positiveIds: string[] = [];

            // resolve explicit inChannel IDs
            for (const chId of inChannel ?? []) {
                if (!mongoose.Types.ObjectId.isValid(chId)) {
                    throw new NotFoundException(
                        ErrorMessages.CHANNEL.NOT_FOUND,
                    );
                }
                const target = allServerChannels.find(
                    (c) => c._id.toString() === chId,
                );
                if (!target) {
                    throw new NotFoundException(
                        ErrorMessages.CHANNEL.NOT_FOUND,
                    );
                }
                if (target.type === 'link') {
                    throw new ForbiddenException(
                        'Cannot search messages in a link channel',
                    );
                }
                const canViewTarget =
                    await this.permissionService.hasChannelPermission(
                        new mongoose.Types.ObjectId(serverId),
                        new mongoose.Types.ObjectId(userId),
                        target._id,
                        'viewChannels',
                    );
                if (canViewTarget === true) {
                    positiveIds.push(target._id.toString());
                }
            }

            // expand inCategory: add all accessible text channels in each category
            for (const catId of inCategory ?? []) {
                if (!mongoose.Types.ObjectId.isValid(catId)) {
                    throw new NotFoundException('Category not found');
                }
                const category = await this.categoryRepo.findByIdAndServer(
                    new mongoose.Types.ObjectId(catId),
                    new mongoose.Types.ObjectId(serverId),
                );
                if (!category) {
                    throw new NotFoundException('Category not found');
                }
                for (const ch of allServerChannels) {
                    if (ch.categoryId?.toString() !== catId) continue;
                    if (ch.type !== 'text') continue;
                    const canView =
                        await this.permissionService.hasChannelPermission(
                            new mongoose.Types.ObjectId(serverId),
                            new mongoose.Types.ObjectId(userId),
                            ch._id,
                            'viewChannels',
                        );
                    if (
                        canView === true &&
                        !positiveIds.includes(ch._id.toString())
                    ) {
                        positiveIds.push(ch._id.toString());
                    }
                }
            }

            // build exclusion set from notInCategory
            const excludedIds = new Set<string>();
            for (const catId of notInCategory ?? []) {
                if (!mongoose.Types.ObjectId.isValid(catId)) {
                    throw new NotFoundException('Category not found');
                }
                const category = await this.categoryRepo.findByIdAndServer(
                    new mongoose.Types.ObjectId(catId),
                    new mongoose.Types.ObjectId(serverId),
                );
                if (!category) {
                    throw new NotFoundException('Category not found');
                }
                for (const ch of allServerChannels) {
                    if (ch.categoryId?.toString() === catId) {
                        excludedIds.add(ch._id.toString());
                    }
                }
            }

            if (hasPositiveScope) {
                // filter positives against exclusions
                const finalIds = positiveIds.filter(
                    (id) => !excludedIds.has(id),
                );
                searchChannelId = finalIds.length > 0 ? finalIds : channelId;
            } else {
                // only notInCategory: expand to all accessible text channels, minus excluded
                const expandedIds: string[] = [];
                for (const ch of allServerChannels) {
                    if (ch.type !== 'text') continue;
                    if (excludedIds.has(ch._id.toString())) continue;
                    const canView =
                        await this.permissionService.hasChannelPermission(
                            new mongoose.Types.ObjectId(serverId),
                            new mongoose.Types.ObjectId(userId),
                            ch._id,
                            'viewChannels',
                        );
                    if (canView === true) expandedIds.push(ch._id.toString());
                }
                searchChannelId =
                    expandedIds.length > 0 ? expandedIds : channelId;
            }
        }

        const filters: SearchFilters = {
            authorType,
            isPinned,
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
            return await this.searchService.searchChannelMessages(
                searchChannelId,
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
