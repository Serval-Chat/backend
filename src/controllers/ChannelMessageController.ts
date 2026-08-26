import {
    Controller,
    Get,
    Patch,
    Post,
    Delete,
    Param,
    Query,
    Body,
    UseGuards,
    Inject,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
    InternalServerErrorException,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
} from '@nestjs/swagger';
import { TYPES } from '@/di/types';
import type {
    IChannel,
    IChannelRepository,
} from '@/di/interfaces/IChannelRepository';
import type {
    IMessageRepository,
    IMessage,
} from '@/di/interfaces/IMessageRepository';
import type {
    IReactionRepository,
    ReactionData,
} from '@/di/interfaces/IReactionRepository';
import type { IMessageSearchService } from '@/di/interfaces/IMessageSearchService';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type { ILogger } from '@/di/interfaces/ILogger';
import { CurrentUser } from '@/modules/auth/current-user.decorator';
import { AuthGuard } from '@/modules/auth/auth.module';
import { ErrorMessages } from '@/constants/errorMessages';
import { assertDefined } from '@/utils/typeGuards';
import { WsServer } from '@/ws/server';
import { EmbedService } from '@/services/EmbedService';
import { embedAttachmentContentForMessages } from '@/utils/attachments';
import {
    ChannelIdParamDTO,
    ChannelMessageIdParamDTO,
    GetChannelMessagesQueryDTO,
} from './dto/channel-message.request.dto';
import { UserEditMessageRequestDTO } from './dto/user-message.request.dto';
import { PollVoteRequestDTO } from './dto/poll-vote.request.dto';
import { DmChannelMessageSearchQueryDTO } from './dto/message-search.request.dto';
import { DmMessageSearchResponseDTO } from './dto/message-search.response.dto';

interface MessageWithReactions extends IMessage {
    reactions: ReactionData[];
}

interface MessageResponse {
    message: IMessage;
    repliedMessage: IMessage | null;
}

@Controller('api/v1/channels/:channelId')
@ApiTags('Channel Messages')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class ChannelMessageController {
    public constructor(
        @Inject(TYPES.ChannelRepository)
        private channelRepo: IChannelRepository,
        @Inject(TYPES.MessageRepository)
        private messageRepo: IMessageRepository,
        @Inject(TYPES.ReactionRepository)
        private reactionRepo: IReactionRepository,
        @Inject(TYPES.MessageSearchService)
        private searchService: IMessageSearchService,
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
        @Inject(TYPES.Logger)
        private logger: ILogger,
        @Inject(TYPES.WsServer)
        private wsServer: WsServer,
        @Inject(TYPES.EmbedService)
        private embedService: EmbedService,
    ) {}

    private async requireDmChannel(
        channelId: string,
        userId: string,
    ): Promise<IChannel> {
        const channel = await this.channelRepo.findById(channelId);
        if (
            channel === null ||
            (channel.type !== 'dm' && channel.type !== 'group_dm')
        ) {
            throw new NotFoundException(ErrorMessages.CHANNEL.NOT_FOUND);
        }
        if ((channel.recipientIds ?? []).includes(userId) !== true) {
            throw new ForbiddenException(ErrorMessages.CHANNEL.NOT_MEMBER);
        }
        return channel;
    }

    @Get('messages')
    @ApiOperation({ summary: 'Get messages in a DM channel' })
    @ApiResponse({ status: 200, description: 'Messages retrieved' })
    @ApiResponse({ status: 403, description: ErrorMessages.CHANNEL.NOT_MEMBER })
    @ApiResponse({ status: 404, description: ErrorMessages.CHANNEL.NOT_FOUND })
    public async getMessages(
        @Param() params: ChannelIdParamDTO,
        @CurrentUser('id') userId: string,
        @Query() query: GetChannelMessagesQueryDTO,
    ): Promise<MessageWithReactions[]> {
        const { channelId } = params;
        await this.requireDmChannel(channelId, userId);

        const { limit, before, around, after, includeAttachmentContent } =
            query;
        const messageLimit = Math.min(limit, 500);
        const msgs = await this.messageRepo.findByChannelId(
            channelId,
            messageLimit,
            before,
            around,
            after,
        );

        const messageIds = msgs.map((m) => m.snowflakeId);
        const reactionsMap = await this.reactionRepo.getReactionsForMessages(
            messageIds,
            'dm',
            userId,
        );

        const messagesWithReactions = msgs.map(
            (msg) =>
                ({
                    ...msg,
                    reactions:
                        (reactionsMap as Record<string, unknown[]>)[
                            msg.snowflakeId
                        ] || [],
                }) as MessageWithReactions,
        );

        if (includeAttachmentContent === true) {
            await embedAttachmentContentForMessages(messagesWithReactions);
        }

        return messagesWithReactions;
    }

    @Get('messages/search')
    @ApiOperation({ summary: 'Search messages in a DM channel' })
    @ApiResponse({ status: 200, type: DmMessageSearchResponseDTO })
    @ApiResponse({ status: 403, description: ErrorMessages.CHANNEL.NOT_MEMBER })
    @ApiResponse({ status: 404, description: ErrorMessages.CHANNEL.NOT_FOUND })
    @ApiResponse({ status: 503, description: 'Search service unavailable' })
    public async searchMessages(
        @Param() params: ChannelIdParamDTO,
        @CurrentUser('id') userId: string,
        @Query() query: DmChannelMessageSearchQueryDTO,
    ): Promise<{ hits: unknown[]; total: number }> {
        const { channelId } = params;
        const channel = await this.requireDmChannel(channelId, userId);

        const otherUserId = (channel.recipientIds ?? []).find(
            (id) => id !== userId,
        );
        if (otherUserId === undefined) {
            return { hits: [], total: 0 };
        }

        const {
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

        const filters: Parameters<
            IMessageSearchService['searchDmMessages']
        >[5] = {
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

        const usernamesToResolve = [
            fromUser,
            mentionsUser,
            notFromUser,
            notMentionsUser,
        ].filter((u): u is string => u !== undefined && u !== '');

        const resolvedUsers =
            usernamesToResolve.length > 0
                ? await this.userRepo.findByUsernames(usernamesToResolve)
                : [];
        const byUsername = new Map(resolvedUsers.map((u) => [u.username, u]));

        if (fromUser !== undefined && fromUser !== '') {
            const sender = byUsername.get(fromUser);
            if (!sender) return { hits: [], total: 0 };
            filters.fromUserId = sender.snowflakeId;
        }
        if (mentionsUser !== undefined && mentionsUser !== '') {
            const mentioned = byUsername.get(mentionsUser);
            if (!mentioned) return { hits: [], total: 0 };
            filters.mentionsUserId = mentioned.snowflakeId;
        }
        if (notFromUser !== undefined && notFromUser !== '') {
            const sender = byUsername.get(notFromUser);
            if (sender) filters.notFromUserId = sender.snowflakeId;
        }
        if (notMentionsUser !== undefined && notMentionsUser !== '') {
            const mentioned = byUsername.get(notMentionsUser);
            if (mentioned) filters.notMentionsUserId = mentioned.snowflakeId;
        }

        try {
            return await this.searchService.searchDmMessages(
                userId,
                otherUserId,
                q,
                limit,
                offset,
                filters,
            );
        } catch {
            throw new InternalServerErrorException(
                'Search service unavailable',
            );
        }
    }

    @Get('messages/:messageId')
    @ApiOperation({ summary: 'Get a message in a DM channel' })
    @ApiResponse({ status: 403, description: ErrorMessages.CHANNEL.NOT_MEMBER })
    @ApiResponse({ status: 404, description: ErrorMessages.MESSAGE.NOT_FOUND })
    public async getMessage(
        @Param() params: ChannelMessageIdParamDTO,
        @CurrentUser('id') userId: string,
    ): Promise<MessageResponse> {
        const { channelId, messageId } = params;
        await this.requireDmChannel(channelId, userId);

        const message = await this.messageRepo.findById(messageId);
        if (message === null || message.channelId !== channelId) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        let repliedMessage = null;
        if (message.repliedToMessageId !== undefined) {
            repliedMessage = await this.messageRepo.findById(
                message.repliedToMessageId,
            );
        } else if (message.replyToId !== undefined) {
            repliedMessage = await this.messageRepo.findById(message.replyToId);
        }

        return { message, repliedMessage };
    }

    @Patch('messages/:messageId')
    @ApiOperation({ summary: 'Edit a message in a DM channel' })
    @ApiResponse({ status: 403, description: ErrorMessages.AUTH.UNAUTHORIZED })
    @ApiResponse({ status: 404, description: ErrorMessages.MESSAGE.NOT_FOUND })
    public async editMessage(
        @Param() params: ChannelMessageIdParamDTO,
        @CurrentUser('id') userId: string,
        @Body() body: UserEditMessageRequestDTO,
    ): Promise<IMessage> {
        const { channelId, messageId } = params;
        await this.requireDmChannel(channelId, userId);

        const message = await this.messageRepo.findById(messageId);
        if (message === null || message.channelId !== channelId) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }
        if (message.senderId.toString() !== userId) {
            throw new ForbiddenException(ErrorMessages.AUTH.UNAUTHORIZED);
        }
        assertDefined(message.receiverId, ErrorMessages.MESSAGE.NOT_FOUND);

        const updated = await this.messageRepo.update(messageId, body.content);
        if (updated === null) {
            throw new InternalServerErrorException(
                ErrorMessages.SYSTEM.INTERNAL_ERROR,
            );
        }

        const broadcastPayload = {
            messageId: updated.snowflakeId,
            text: updated.text,
            editedAt: updated.editedAt
                ? updated.editedAt.toISOString()
                : new Date().toISOString(),
            isEdited: true as const,
        };
        this.wsServer.broadcastToUser(message.senderId.toString(), {
            type: 'message_dm_edited',
            payload: broadcastPayload,
        });
        this.wsServer.broadcastToUser(message.receiverId.toString(), {
            type: 'message_dm_edited',
            payload: broadcastPayload,
        });

        if (updated.text && updated.text.includes('http')) {
            Promise.resolve()
                .then(() => this.embedService.processUserMessage(updated))
                .catch((err: Error) =>
                    this.logger.error('Failed to process embeds', err.stack),
                );
        }

        return updated;
    }

    @Delete('messages/:messageId')
    @ApiOperation({ summary: 'Delete a message in a DM channel' })
    @ApiResponse({ status: 403, description: ErrorMessages.AUTH.UNAUTHORIZED })
    @ApiResponse({ status: 404, description: ErrorMessages.MESSAGE.NOT_FOUND })
    public async deleteMessage(
        @Param() params: ChannelMessageIdParamDTO,
        @CurrentUser('id') userId: string,
    ): Promise<{ success: boolean }> {
        const { channelId, messageId } = params;
        await this.requireDmChannel(channelId, userId);

        const message = await this.messageRepo.findById(messageId);
        if (message === null || message.channelId !== channelId) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }
        if (message.senderId.toString() !== userId) {
            throw new ForbiddenException(ErrorMessages.AUTH.UNAUTHORIZED);
        }
        assertDefined(message.receiverId, ErrorMessages.MESSAGE.NOT_FOUND);

        const deleted = await this.messageRepo.hardDelete(messageId);
        if (deleted) {
            this.searchService
                .removeDmMessage(messageId)
                .catch((err: unknown) => {
                    this.logger.error(
                        'Failed to remove DM message from index',
                        (err as Error).stack,
                    );
                });
            this.wsServer.broadcastToUser(message.senderId.toString(), {
                type: 'message_dm_deleted',
                payload: { messageId },
            });
            this.wsServer.broadcastToUser(message.receiverId.toString(), {
                type: 'message_dm_deleted',
                payload: { messageId },
            });
        }
        return { success: deleted };
    }

    @Post('messages/:messageId/poll/vote')
    @ApiOperation({ summary: 'Vote on a poll in a DM channel' })
    @ApiResponse({ status: 400, description: 'Invalid vote or not a poll' })
    @ApiResponse({ status: 403, description: ErrorMessages.AUTH.UNAUTHORIZED })
    @ApiResponse({ status: 404, description: ErrorMessages.MESSAGE.NOT_FOUND })
    public async votePoll(
        @Param() params: ChannelMessageIdParamDTO,
        @CurrentUser('id') userId: string,
        @Body() body: PollVoteRequestDTO,
    ): Promise<IMessage> {
        const { channelId, messageId } = params;
        await this.requireDmChannel(channelId, userId);

        const message = await this.messageRepo.findById(messageId);
        if (message === null || message.channelId !== channelId) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }
        assertDefined(message.receiverId, ErrorMessages.MESSAGE.NOT_FOUND);

        if (!message.poll) {
            throw new BadRequestException(
                'This message does not contain a poll.',
            );
        }

        const { poll } = message;
        if (poll.expiresAt && new Date() > new Date(poll.expiresAt)) {
            throw new BadRequestException(
                'This poll has ended and can no longer be voted on.',
            );
        }
        if (!poll.multiSelect && body.optionIds.length > 1) {
            throw new BadRequestException(
                'This poll does not allow multiple selections.',
            );
        }
        const validOptionIds = poll.options.map((o) => o.id);
        const allValid = body.optionIds.every((id) =>
            validOptionIds.includes(id),
        );
        if (!allValid) {
            throw new BadRequestException(
                'One or more option IDs are invalid.',
            );
        }

        const updatedDoc = await this.messageRepo.setPollVote(
            messageId,
            userId,
            body.optionIds,
        );
        if (updatedDoc === null) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }
        if (updatedDoc.poll === undefined) {
            throw new InternalServerErrorException(
                'Poll data missing after update',
            );
        }

        const payload = { messageId, poll: updatedDoc.poll };
        this.wsServer.broadcastToUser(message.senderId.toString(), {
            type: 'poll_vote_updated_dm',
            payload,
        });
        this.wsServer.broadcastToUser(message.receiverId.toString(), {
            type: 'poll_vote_updated_dm',
            payload,
        });

        return updatedDoc;
    }
}
