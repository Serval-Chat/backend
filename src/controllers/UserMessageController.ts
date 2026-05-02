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
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiQuery,
} from '@nestjs/swagger';
import { injectable } from 'inversify';
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
import {
    UserEditMessageRequestDTO,
    GetMessagesQueryDTO,
    MessageIdParamDTO,
    UserMessageParamsDTO,
} from './dto/user-message.request.dto';
import { Types } from 'mongoose';

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

@injectable()
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
    ) {}

    @Get('unread')
    @ApiOperation({ summary: 'Get unread counts' })
    @ApiResponse({ status: 200, description: 'Unread counts retrieved' })
    public async getUnreadCounts(
        @Req() req: ExpressRequest,
    ): Promise<UnreadCountsResponse> {
        const meId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const docs = await this.dmUnreadRepo.findByUser(
            new Types.ObjectId(meId),
        );

        const unreadCounts: Record<string, number> = {};
        docs.forEach((doc) => {
            unreadCounts[doc.peer.toString()] = doc.count;
        });

        return { counts: unreadCounts };
    }

    @Get()
    @ApiOperation({ summary: 'Get messages' })
    @ApiQuery({ name: 'userId', required: true })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'before', required: false, type: String })
    @ApiQuery({ name: 'around', required: false, type: String })
    @ApiResponse({ status: 200, description: 'Messages retrieved' })
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
        const otherUserId = userDoc._id.toString();

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

        const messageIds = msgs.map((m) => m._id);
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
                            msg._id.toString()
                        ] || [],
                }) as MessageWithReactions,
        );

        return messagesWithReactions;
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get message by ID' })
    @ApiQuery({ name: 'userId', required: true })
    @ApiResponse({ status: 200, description: 'Message retrieved' })
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
        const otherUserId = userDoc._id.toString();

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
    @ApiResponse({ status: 200, description: 'Message retrieved' })
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
    @ApiResponse({ status: 200, description: 'Message updated' })
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

        return updated;
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete message' })
    @ApiResponse({ status: 200, description: 'Message deleted' })
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
        return { success: deleted };
    }
}
