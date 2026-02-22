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

// Controller for managing direct messages (DMs) between users
// Enforces friendship checks and conversation membership validation
@injectable()
@Controller('api/v1/messages')
@ApiTags('User Messages')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UserMessageController {
    constructor(
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
    ) { }

    // Retrieves unread DM counts for the current user, grouped by peer
    @Get('unread')
    @ApiOperation({ summary: 'Get unread counts' })
    @ApiResponse({ status: 200, description: 'Unread counts retrieved' })
    public async getUnreadCounts(
        @Req() req: ExpressRequest,
    ): Promise<UnreadCountsResponse> {
        const meId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const docs = await this.dmUnreadRepo.findByUser(new Types.ObjectId(meId));

        // Map unread count documents to a simple peerId -> count record
        const unreadCounts: Record<string, number> = {};
        docs.forEach((doc) => {
            unreadCounts[doc.peer.toString()] = doc.count;
        });

        return { counts: unreadCounts };
    }

    // Retrieves messages between the current user and a specific peer
    // Enforces that both users are friends
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

        const userDoc = await this.userRepo.findById(new Types.ObjectId(userId));
        if (!userDoc) {
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }
        const otherUserId = userDoc._id.toString();

        // Only allow message retrieval if a friendship exists
        if (!(await this.friendshipRepo.areFriends(new Types.ObjectId(meId), new Types.ObjectId(otherUserId)))) {
            throw new ForbiddenException(ErrorMessages.FRIENDSHIP.NOT_FRIENDS);
        }

        // Enforce an upper limit to prevent excessive data retrieval
        const messageLimit = Math.min(limit, 500);
        // Fetch messages using cursor-based pagination (before / around)
        // Repository already includes referenced_message from populate
        const msgs = await this.messageRepo.findByConversation(
            new Types.ObjectId(meId),
            new Types.ObjectId(otherUserId),
            messageLimit,
            before,
            around,
            after,
        );

        // Bulk fetch reactions for all retrieved messages to avoid N+1 query patterns
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

    // Retrieves a specific message by ID
    // Enforces friendship and conversation membership
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

        const userDoc = await this.userRepo.findById(new Types.ObjectId(userId));
        if (!userDoc) {
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }
        const otherUserId = userDoc._id.toString();

        if (!(await this.friendshipRepo.areFriends(new Types.ObjectId(meId), new Types.ObjectId(otherUserId)))) {
            throw new ForbiddenException(ErrorMessages.FRIENDSHIP.NOT_FRIENDS);
        }

        const targetMessage = await this.messageRepo.findById(new Types.ObjectId(id));
        if (!targetMessage) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        // Ensure the message actually belongs to the conversation between these two users
        const isPartOfConversation =
            (targetMessage.senderId.toString() === meId &&
                targetMessage.receiverId.toString() === otherUserId) ||
            (targetMessage.senderId.toString() === otherUserId &&
                targetMessage.receiverId.toString() === meId);

        if (!isPartOfConversation) {
            throw new ForbiddenException(
                ErrorMessages.MESSAGE.NOT_IN_CONVERSATION,
            );
        }

        let repliedMessage = null;
        if (targetMessage.replyToId) {
            repliedMessage = await this.messageRepo.findById(
                targetMessage.replyToId,
            );
        }

        return { message: targetMessage, repliedMessage };
    }

    // Retrieves a single message by ID with friendship check (alternative route)
    // Enforces conversation membership
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

        // Ensure users are friends before allowing message access
        if (!(await this.friendshipRepo.areFriends(new Types.ObjectId(meId), new Types.ObjectId(userId)))) {
            if (meId !== userId) {
                throw new ForbiddenException(
                    ErrorMessages.FRIENDSHIP.NOT_FRIENDS,
                );
            }
        }

        const message = await this.messageRepo.findById(new Types.ObjectId(messageId));
        if (!message) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        // Ensure the message actually belongs to the conversation between these two users
        const isPartOfConversation =
            (message.senderId.toString() === meId &&
                message.receiverId.toString() === userId) ||
            (message.senderId.toString() === userId &&
                message.receiverId.toString() === meId);

        if (!isPartOfConversation) {
            throw new ForbiddenException(
                ErrorMessages.MESSAGE.NOT_IN_CONVERSATION,
            );
        }

        let repliedMessage = null;
        // Resolve the replied-to message, handling both legacy and new ID fields
        if (message.repliedToMessageId) {
            repliedMessage = await this.messageRepo.findById(
                message.repliedToMessageId,
            );
        } else if (message.replyToId) {
            repliedMessage = await this.messageRepo.findById(message.replyToId);
        }

        return { message, repliedMessage };
    }

    // Edits an existing direct message
    // Enforces that only the original sender can edit their message
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
        if (!message) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        // Only the sender is authorized to modify the message content
        if (message.senderId.toString() !== meId) {
            throw new ForbiddenException(ErrorMessages.AUTH.UNAUTHORIZED);
        }

        const updated = await this.messageRepo.update(new Types.ObjectId(id), content);
        // Mark message as edited for client-side rendering
        if (!updated) {
            throw new InternalServerErrorException(
                ErrorMessages.SYSTEM.INTERNAL_ERROR,
            );
        }

        return updated;
    }

    // Deletes a direct message
    // Enforces that only the original sender can delete their message
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
        if (!message) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        // Only the sender is authorized to delete the message
        if (message.senderId.toString() !== meId) {
            throw new ForbiddenException(ErrorMessages.AUTH.UNAUTHORIZED);
        }

        const deleted = await this.messageRepo.delete(new Types.ObjectId(id));
        return { success: deleted };
    }
}
