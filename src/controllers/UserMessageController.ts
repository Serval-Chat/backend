import {
    Controller,
    Get,
    Patch,
    Delete,
    Body,
    Query,
    Param,
    Req,
    UseGuards,
    Inject,
    NotFoundException,
    ForbiddenException,
    InternalServerErrorException,
    Post,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiOkResponse,
    ApiBearerAuth,
    ApiQuery,
} from '@nestjs/swagger';
import {
    UnreadCountsResponseDTO,
    DmMessageListResponseDTO,
    DmMessageResponseDTO,
    DmMessageDeleteResponseDTO,
    DmPollVoteResponseDTO,
} from './dto/user-message.response.dto';
import { TYPES } from '@/di/types';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type { IFriendshipRepository } from '@/di/interfaces/IFriendshipRepository';
import type {
    IMessageRepository,
    IMessage,
} from '@/di/interfaces/IMessageRepository';
import type { IDmUnreadRepository } from '@/di/interfaces/IDmUnreadRepository';
import type {
    IReactionRepository,
    ReactionData,
} from '@/di/interfaces/IReactionRepository';
import type { ILogger } from '@/di/interfaces/ILogger';
import type { Request as ExpressRequest } from 'express';
import { ErrorMessages } from '@/constants/errorMessages';
import { JWTPayload } from '@/utils/jwt';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { WsServer } from '@/ws/server';
import { EmbedService } from '@/services/EmbedService';
import {
    UserEditMessageRequestDTO,
    GetMessagesQueryDTO,
    MessageIdParamDTO,
    UserMessageParamsDTO,
} from './dto/user-message.request.dto';
import { getDocumentId, getDocumentIdString } from '@/utils/mongooseId';
import { PollVoteRequestDTO } from './dto/poll-vote.request.dto';
import mongoose, { Types } from 'mongoose';
import { BadRequestException } from '@nestjs/common';

interface UnreadCountsResponse {
    counts: Record<string, number>;
}

interface MessageWithReactions extends IMessage {
    reactions: ReactionData[];
}

interface MessageResponse {
    message: IMessage;
    repliedMessage: IMessage | null;
}

@Controller('api/v1/messages')
@ApiTags('User Messages')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UserMessageController {
    public constructor(
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
        @Inject(TYPES.FriendshipRepository)
        private friendshipRepo: IFriendshipRepository,
        @Inject(TYPES.MessageRepository)
        private messageRepo: IMessageRepository,
        @Inject(TYPES.DmUnreadRepository)
        private dmUnreadRepo: IDmUnreadRepository,
        @Inject(TYPES.ReactionRepository)
        private reactionRepo: IReactionRepository,
        @Inject(TYPES.Logger)
        private logger: ILogger,
        @Inject(TYPES.WsServer)
        private wsServer: WsServer,
        @Inject(TYPES.EmbedService)
        private embedService: EmbedService,
    ) {}

    @Get('unread')
    @ApiOperation({ summary: 'Get unread counts' })
    @ApiOkResponse({
        type: UnreadCountsResponseDTO,
        description: 'Unread counts retrieved',
    })
    public async getUnreadCounts(
        @Req() req: ExpressRequest,
    ): Promise<UnreadCountsResponse> {
        const meIdStr = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const meId = new Types.ObjectId(meIdStr);
        const docs = await this.dmUnreadRepo.findByUser(meId);

        const unreadCounts: Record<string, number> = {};

        await Promise.all(
            docs.map(async (doc) => {
                const peerId = doc.peer;
                const areFriends = await this.friendshipRepo.areFriends(
                    meId,
                    peerId,
                );
                if (areFriends === true) {
                    unreadCounts[peerId.toString()] = doc.count;
                } else if (doc.count > 0) {
                    // Clean up orphaned unread records from non-friends
                    this.logger.warn(
                        `Cleaning up orphaned unread count for user ${meIdStr} from non-friend ${peerId.toString()}`,
                    );
                    await this.dmUnreadRepo.delete(meId, peerId);
                }
            }),
        );

        return { counts: unreadCounts };
    }

    @Get()
    @ApiOperation({ summary: 'Get messages' })
    @ApiQuery({ name: 'userId', required: true })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'before', required: false, type: String })
    @ApiQuery({ name: 'around', required: false, type: String })
    @ApiOkResponse({
        type: DmMessageListResponseDTO,
        description: 'Messages retrieved',
    })
    @ApiResponse({ status: 400, description: 'User ID is required' })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.FRIENDSHIP.NOT_FRIENDS,
    })
    @ApiResponse({
        status: 404,
        description: ErrorMessages.AUTH.USER_NOT_FOUND,
    })
    public async getMessages(
        @Req() req: ExpressRequest,
        @Query() query: GetMessagesQueryDTO,
    ): Promise<MessageWithReactions[]> {
        const meId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const { userId, limit, before, around, after } = query;

        const userDoc = await this.userRepo.findById(
            new Types.ObjectId(userId),
        );
        if (userDoc === null) {
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }
        const otherUserId = getDocumentIdString(userDoc);

        if (
            (await this.friendshipRepo.areFriends(
                new Types.ObjectId(meId),
                new Types.ObjectId(otherUserId),
            )) !== true
        ) {
            throw new ForbiddenException(ErrorMessages.FRIENDSHIP.NOT_FRIENDS);
        }

        const messageLimit = Math.min(limit, 500);
        const msgs = await this.messageRepo.findByConversation(
            new Types.ObjectId(meId),
            new Types.ObjectId(otherUserId),
            messageLimit,
            before,
            around,
            after,
        );

        const messageIds = msgs.map((m) => getDocumentId(m) as Types.ObjectId);
        const reactionsMap = await this.reactionRepo.getReactionsForMessages(
            messageIds,
            'dm',
            new Types.ObjectId(meId),
        );

        const messagesWithReactions = msgs.map(
            (msg) =>
                ({
                    ...msg,
                    reactions:
                        (reactionsMap as Record<string, unknown[]>)[
                            getDocumentIdString(msg)
                        ] || [],
                }) as MessageWithReactions,
        );

        return messagesWithReactions;
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get message by ID' })
    @ApiQuery({ name: 'userId', required: true })
    @ApiOkResponse({
        type: DmMessageResponseDTO,
        description: 'Message retrieved',
    })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.FRIENDSHIP.NOT_FRIENDS,
    })
    @ApiResponse({ status: 404, description: ErrorMessages.MESSAGE.NOT_FOUND })
    public async getMessage(
        @Param() params: MessageIdParamDTO,
        @Req() req: ExpressRequest,
        @Query('userId') userId: string,
    ): Promise<MessageResponse> {
        const { id } = params;
        const meId = (req as ExpressRequest & { user: JWTPayload }).user.id;

        const userDoc = await this.userRepo.findById(
            new Types.ObjectId(userId),
        );
        if (userDoc === null) {
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }
        const otherUserId = getDocumentIdString(userDoc);

        if (
            (await this.friendshipRepo.areFriends(
                new Types.ObjectId(meId),
                new Types.ObjectId(otherUserId),
            )) !== true
        ) {
            throw new ForbiddenException(ErrorMessages.FRIENDSHIP.NOT_FRIENDS);
        }

        const targetMessage = await this.messageRepo.findById(
            new Types.ObjectId(id),
        );
        if (targetMessage === null) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        const isPartOfConversation =
            (targetMessage.senderId.toString() === meId &&
                targetMessage.receiverId.toString() === otherUserId) ||
            (targetMessage.senderId.toString() === otherUserId &&
                targetMessage.receiverId.toString() === meId);

        if (isPartOfConversation === false) {
            throw new ForbiddenException(
                ErrorMessages.MESSAGE.NOT_IN_CONVERSATION,
            );
        }

        let repliedMessage = null;
        if (targetMessage.replyToId !== undefined) {
            repliedMessage = await this.messageRepo.findById(
                targetMessage.replyToId,
            );
        }

        return { message: targetMessage, repliedMessage };
    }

    @Get(':userId/:messageId')
    @ApiOperation({ summary: 'Get user message' })
    @ApiOkResponse({
        type: DmMessageResponseDTO,
        description: 'Message retrieved',
    })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.FRIENDSHIP.NOT_FRIENDS,
    })
    @ApiResponse({ status: 404, description: ErrorMessages.MESSAGE.NOT_FOUND })
    public async getUserMessage(
        @Param() params: UserMessageParamsDTO,
        @Req() req: ExpressRequest,
    ): Promise<MessageResponse> {
        const { userId, messageId } = params;
        const meId = (req as ExpressRequest & { user: JWTPayload }).user.id;

        if (
            (await this.friendshipRepo.areFriends(
                new Types.ObjectId(meId),
                new Types.ObjectId(userId),
            )) !== true
        ) {
            if (meId !== userId) {
                throw new ForbiddenException(
                    ErrorMessages.FRIENDSHIP.NOT_FRIENDS,
                );
            }
        }

        const message = await this.messageRepo.findById(
            new Types.ObjectId(messageId),
        );
        if (message === null) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        const isPartOfConversation =
            (message.senderId.toString() === meId &&
                message.receiverId.toString() === userId) ||
            (message.senderId.toString() === userId &&
                message.receiverId.toString() === meId);

        if (isPartOfConversation === false) {
            throw new ForbiddenException(
                ErrorMessages.MESSAGE.NOT_IN_CONVERSATION,
            );
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

    @Patch(':id')
    @ApiOperation({ summary: 'Edit message' })
    @ApiOkResponse({
        type: DmMessageResponseDTO,
        description: 'Message updated',
    })
    @ApiResponse({ status: 403, description: ErrorMessages.AUTH.UNAUTHORIZED })
    @ApiResponse({ status: 404, description: ErrorMessages.MESSAGE.NOT_FOUND })
    public async editMessage(
        @Param() params: MessageIdParamDTO,
        @Req() req: ExpressRequest,
        @Body() body: UserEditMessageRequestDTO,
    ): Promise<IMessage> {
        const { id } = params;
        const meId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const { content } = body;

        const message = await this.messageRepo.findById(new Types.ObjectId(id));
        if (message === null) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        if (message.senderId.toString() !== meId) {
            throw new ForbiddenException(ErrorMessages.AUTH.UNAUTHORIZED);
        }

        const updated = await this.messageRepo.update(
            new Types.ObjectId(id),
            content,
        );
        if (updated === null) {
            throw new InternalServerErrorException(
                ErrorMessages.SYSTEM.INTERNAL_ERROR,
            );
        }

        const broadcastPayload = {
            messageId: getDocumentIdString(updated),
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
                .catch((err) =>
                    this.logger.error('Failed to process embeds', err.stack),
                );
        }

        return updated;
    }

    @Post(':id/poll/vote')
    @ApiOperation({ summary: 'Vote on a poll' })
    @ApiOkResponse({
        type: DmPollVoteResponseDTO,
        description: 'Vote registered',
    })
    @ApiResponse({ status: 400, description: 'Invalid vote or not a poll' })
    @ApiResponse({ status: 403, description: ErrorMessages.AUTH.UNAUTHORIZED })
    @ApiResponse({ status: 404, description: ErrorMessages.MESSAGE.NOT_FOUND })
    public async votePoll(
        @Param() params: MessageIdParamDTO,
        @Req() req: ExpressRequest,
        @Body() body: PollVoteRequestDTO,
    ): Promise<IMessage> {
        const { id } = params;
        const meId = (req as ExpressRequest & { user: JWTPayload }).user.id;

        const message = await this.messageRepo.findById(new Types.ObjectId(id));
        if (message === null) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }

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

        const userObjId = new Types.ObjectId(meId);

        const newOptions = poll.options.map((opt) => {
            const votes = opt.votes.filter((v) => v.toString() !== meId);
            if (body.optionIds.includes(opt.id)) {
                votes.push(userObjId);
            }
            return { ...opt, votes };
        });

        const MessageModel = mongoose.model('Message');
        const updatedDoc = (await MessageModel.findByIdAndUpdate(
            new Types.ObjectId(id),
            { 'poll.options': newOptions },
            { new: true },
        ).lean()) as IMessage | null;

        if (updatedDoc === null) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        if (updatedDoc.poll === undefined) {
            throw new InternalServerErrorException(
                'Poll data missing after update',
            );
        }

        const payload = {
            messageId: id,
            poll: updatedDoc.poll,
        };

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

    @Delete(':id')
    @ApiOperation({ summary: 'Delete message' })
    @ApiOkResponse({
        type: DmMessageDeleteResponseDTO,
        description: 'Message deleted',
    })
    @ApiResponse({ status: 403, description: ErrorMessages.AUTH.UNAUTHORIZED })
    @ApiResponse({ status: 404, description: ErrorMessages.MESSAGE.NOT_FOUND })
    public async deleteMessage(
        @Param() params: MessageIdParamDTO,
        @Req() req: ExpressRequest,
    ): Promise<{ success: boolean }> {
        const { id } = params;
        const meId = (req as ExpressRequest & { user: JWTPayload }).user.id;

        const message = await this.messageRepo.findById(new Types.ObjectId(id));
        if (message === null) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        if (message.senderId.toString() !== meId) {
            throw new ForbiddenException(ErrorMessages.AUTH.UNAUTHORIZED);
        }

        const deleted = await this.messageRepo.delete(new Types.ObjectId(id));
        if (deleted) {
            this.wsServer.broadcastToUser(message.senderId.toString(), {
                type: 'message_dm_deleted',
                payload: { messageId: id },
            });
            this.wsServer.broadcastToUser(message.receiverId.toString(), {
                type: 'message_dm_deleted',
                payload: { messageId: id },
            });
        }
        return { success: deleted };
    }
}
