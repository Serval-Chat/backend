import {
    Controller,
    Get,
    Inject,
    Param,
    Query,
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
import { CurrentUser } from '@/modules/auth/current-user.decorator';
import { ErrorMessages } from '@/constants/errorMessages';
import { isValidSnowflakeId } from '@/utils/snowflake';

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
        @CurrentUser('id') userId: string,
    ): Promise<ChannelMessageSearchResponseDTO> {
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
            serverId,
            userId,
        );
        if (member === null) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const channel = await this.channelRepo.findById(channelId);
        if (channel === null || channel.serverId.toString() !== serverId) {
            throw new NotFoundException(ErrorMessages.CHANNEL.NOT_FOUND);
        }
        if (channel.type === 'link') {
            throw new ForbiddenException(
                'Cannot search messages in a link channel',
            );
        }

        await this.permissionService.requireChannelPermission(
            serverId,
            userId,
            channelId,
            'viewChannels',
            new ForbiddenException(ErrorMessages.CHANNEL.NOT_FOUND),
        );

        let searchChannelId: string | string[] = channelId;
        const hasPositiveScope =
            (inChannel !== undefined && inChannel.length > 0) ||
            (inCategory !== undefined && inCategory.length > 0);

        if (
            hasPositiveScope ||
            (notInCategory !== undefined && notInCategory.length > 0)
        ) {
            // fetch all server channels once; needed for category expansion
            const allServerChannels =
                await this.channelRepo.findByServerId(serverId);

            const positiveIds: string[] = [];

            // resolve explicit inChannel IDs
            for (const chId of inChannel ?? []) {
                if (!isValidSnowflakeId(chId)) {
                    throw new NotFoundException(
                        ErrorMessages.CHANNEL.NOT_FOUND,
                    );
                }
                const target = allServerChannels.find(
                    (c) => c.snowflakeId === chId,
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
                        serverId,
                        userId,
                        target.snowflakeId,
                        'viewChannels',
                    );
                if (canViewTarget === true) {
                    positiveIds.push(target.snowflakeId);
                }
            }

            // expand inCategory: add all accessible text channels in each category
            for (const catId of inCategory ?? []) {
                if (!isValidSnowflakeId(catId)) {
                    throw new NotFoundException('Category not found');
                }
                const category = await this.categoryRepo.findByIdAndServer(
                    catId,
                    serverId,
                );
                if (!category) {
                    throw new NotFoundException('Category not found');
                }
                for (const ch of allServerChannels) {
                    if (ch.categoryId?.toString() !== catId) continue;
                    if (ch.type !== 'text') continue;
                    const canView =
                        await this.permissionService.hasChannelPermission(
                            serverId,
                            userId,
                            ch.snowflakeId,
                            'viewChannels',
                        );
                    if (
                        canView === true &&
                        !positiveIds.includes(ch.snowflakeId)
                    ) {
                        positiveIds.push(ch.snowflakeId);
                    }
                }
            }

            // build exclusion set from notInCategory
            const excludedIds = new Set<string>();
            for (const catId of notInCategory ?? []) {
                if (!isValidSnowflakeId(catId)) {
                    throw new NotFoundException('Category not found');
                }
                const category = await this.categoryRepo.findByIdAndServer(
                    catId,
                    serverId,
                );
                if (!category) {
                    throw new NotFoundException('Category not found');
                }
                for (const ch of allServerChannels) {
                    if (ch.categoryId?.toString() === catId) {
                        excludedIds.add(ch.snowflakeId);
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
                    if (excludedIds.has(ch.snowflakeId)) continue;
                    const canView =
                        await this.permissionService.hasChannelPermission(
                            serverId,
                            userId,
                            ch.snowflakeId,
                            'viewChannels',
                        );
                    if (canView === true) expandedIds.push(ch.snowflakeId);
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
            filters.fromUserId = sender.snowflakeId;
        }

        // resolve mentions: username -> userId
        if (mentionsUser !== undefined && mentionsUser !== '') {
            const mentioned = await this.userRepo.findByUsername(mentionsUser);
            if (!mentioned) return { hits: [], total: 0 };
            filters.mentionsUserId = mentioned.snowflakeId;
        }

        // resolve negated from: username -> userId
        if (notFromUser !== undefined && notFromUser !== '') {
            const sender = await this.userRepo.findByUsername(notFromUser);
            if (sender) filters.notFromUserId = sender.snowflakeId;
        }

        // resolve negated mentions: username -> userId
        if (notMentionsUser !== undefined && notMentionsUser !== '') {
            const mentioned =
                await this.userRepo.findByUsername(notMentionsUser);
            if (mentioned) filters.notMentionsUserId = mentioned.snowflakeId;
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
