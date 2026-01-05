import {
    Controller,
    Get,
    Post,
    Delete,
    Body,
    Param,
    Req,
    UseGuards,
    Inject,
} from '@nestjs/common';
import { TYPES } from '@/di/types';
import { IUserRepository } from '@/di/interfaces/IUserRepository';
import { IFriendshipRepository } from '@/di/interfaces/IFriendshipRepository';
import { IMessageRepository } from '@/di/interfaces/IMessageRepository';
import { PresenceService } from '@/realtime/services/PresenceService';
import { ILogger } from '@/di/interfaces/ILogger';
import { ApiTags, ApiResponse, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { getIO } from '@/socket';
import { type SerializedCustomStatus } from '@/utils/status';
import { mapUser } from '@/utils/user';
import { Request } from 'express';
import { JWTPayload } from '@/utils/jwt';
import { ApiError } from '@/utils/ApiError';
import { ErrorMessages } from '@/constants/errorMessages';

import { SendFriendRequestDTO } from './dto/friendship.request.dto';
import {
    FriendResponseDTO,
    IncomingFriendRequestResponseDTO,
    SendFriendRequestResponseDTO,
    AcceptFriendRequestResponseDTO,
    FriendshipMessageResponseDTO,
} from './dto/friendship.response.dto';
import { injectable, inject } from 'inversify';

interface RequestWithUser extends Request {
    user: JWTPayload;
}

// Controller for managing user friendships and friend requests
// Enforces boundaries via ownership checks on requests and friendships
@ApiTags('Friends')
@injectable()
@Controller('api/v1/friends')
export class FriendshipController {
    constructor(
        @inject(TYPES.UserRepository)
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
        @inject(TYPES.FriendshipRepository)
        @Inject(TYPES.FriendshipRepository)
        private friendshipRepo: IFriendshipRepository,
        @inject(TYPES.MessageRepository)
        @Inject(TYPES.MessageRepository)
        private messageRepo: IMessageRepository,
        @inject(TYPES.PresenceService)
        @Inject(TYPES.PresenceService)
        private presenceService: PresenceService,
        @inject(TYPES.Logger)
        @Inject(TYPES.Logger)
        private logger: ILogger,
    ) { }

    // Maps a user document to a public friend payload
    private mapUserToFriendPayload(user: unknown): FriendResponseDTO | null {
        const mapped = mapUser(user);
        if (!mapped) return null;

        return {
            _id: mapped.id,
            username: mapped.username,
            displayName: mapped.displayName || undefined,
            createdAt: mapped.createdAt,
            profilePicture: mapped.profilePicture,
            customStatus: mapped.customStatus as SerializedCustomStatus | null,
        };
    }

    @Get()
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get friends list' })
    @ApiResponse({ status: 200, type: [FriendResponseDTO] })
    public async getFriends(
        @Req() req: Request,
    ): Promise<FriendResponseDTO[]> {
        const userId = (req as unknown as RequestWithUser).user.id;

        const me = await this.userRepo.findById(userId);
        if (!me) {
            throw new ApiError(401, ErrorMessages.AUTH.UNAUTHORIZED);
        }

        const friendships = await this.friendshipRepo.findByUserId(userId);
        const friendIds = new Set<string>();
        const legacyUsernames = new Set<string>();

        // Extract friend identifiers from both modern (ID-based) and legacy (username-based) friendships
        friendships.forEach((rel) => {
            const userIdStr = rel.userId?.toString();
            const friendIdStr = rel.friendId?.toString();
            const otherId = userIdStr === userId ? friendIdStr : userIdStr;

            if (otherId && otherId !== userId) {
                friendIds.add(otherId);
            } else if (rel.friend) {
                legacyUsernames.add(rel.friend);
            }
        });

        const friendsById = [];
        for (const friendId of Array.from(friendIds)) {
            const friend = await this.userRepo.findById(friendId);
            if (friend) friendsById.push(friend);
        }

        friendsById.forEach((doc) => {
            if (doc.username) {
                legacyUsernames.delete(doc.username);
            }
        });

        const friendsByUsername = [];
        for (const username of Array.from(legacyUsernames)) {
            const friend = await this.userRepo.findByUsername(username);
            if (friend) friendsByUsername.push(friend);
        }

        const combinedFriends = [...friendsById, ...friendsByUsername];

        // Enrichment with latest message timestamp for sorting
        const friendsWithLatestMessage = await Promise.all(
            combinedFriends.map(async (friend) => {
                const friendId = friend._id?.toString();
                if (!friendId) {
                    return { friend, latestMessageAt: null };
                }
                const conversationMessages = await this.messageRepo.findByConversation(
                    userId,
                    friendId,
                    1,
                );
                const latestMessage = conversationMessages.length > 0 ? conversationMessages[0] : null;

                return {
                    friend,
                    latestMessageAt: latestMessage
                        ? latestMessage.createdAt
                            ? new Date(latestMessage.createdAt).toISOString()
                            : null
                        : null,
                };
            }),
        );

        // Sorting by activity: most recent messages first
        friendsWithLatestMessage.sort((a, b) => {
            if (a.latestMessageAt === null && b.latestMessageAt === null)
                return 0;
            if (a.latestMessageAt === null) return 1;
            if (b.latestMessageAt === null) return -1;
            return (
                new Date(b.latestMessageAt).getTime() -
                new Date(a.latestMessageAt).getTime()
            );
        });

        return friendsWithLatestMessage
            .map(({ friend, latestMessageAt }) => {
                const payload = this.mapUserToFriendPayload(friend);
                if (payload) {
                    payload.latestMessageAt = latestMessageAt;

                    // Handling deleted user profile picture
                    if (friend.deletedAt) {
                        payload.profilePicture = '/images/deleted-cat.jpg';
                    }
                }
                return payload as FriendResponseDTO;
            })
            .filter((p) => p !== null);
    }

    @Get('incoming')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get incoming friend requests' })
    @ApiResponse({ status: 200, type: [IncomingFriendRequestResponseDTO] })
    public async getIncomingRequests(
        @Req() req: Request,
    ): Promise<IncomingFriendRequestResponseDTO[]> {
        const userId = (req as unknown as RequestWithUser).user.id;
        const incoming =
            await this.friendshipRepo.findPendingRequestsFor(userId);

        return await Promise.all(
            incoming.map(async (r) => {
                let fromUsername = r.from;
                if (!fromUsername && r.fromId) {
                    const fromUser = await this.userRepo.findById(
                        r.fromId.toString(),
                    );
                    fromUsername = fromUser?.username;
                }

                return {
                    _id: r._id.toString(),
                    from: fromUsername,
                    fromId: r.fromId?.toString(),
                    createdAt: r.createdAt || new Date(),
                };
            }),
        );
    }

    @Post()
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Send a friend request' })
    @ApiResponse({ status: 201, type: SendFriendRequestResponseDTO })
    @ApiResponse({ status: 400, description: 'User not found or already friends' })
    @ApiResponse({ status: 404, description: 'User not found' })
    public async sendFriendRequest(
        @Req() req: Request,
        @Body() body: SendFriendRequestDTO,
    ): Promise<SendFriendRequestResponseDTO> {
        const meId = (req as unknown as RequestWithUser).user.id;
        const meUser = await this.userRepo.findById(meId);
        if (!meUser) {
            throw new ApiError(401, ErrorMessages.AUTH.UNAUTHORIZED);
        }

        const { username: friendUsername } = body;


        const friendUser = await this.userRepo.findByUsername(friendUsername);
        if (!friendUser) {
            throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        const friendId = friendUser._id.toString();
        if (friendId === meId) {
            throw new ApiError(400, ErrorMessages.FRIENDSHIP.CANNOT_ADD_SELF);
        }

        if (await this.friendshipRepo.areFriends(meId, friendId)) {
            throw new ApiError(400, ErrorMessages.FRIENDSHIP.ALREADY_FRIENDS);
        }

        const existingRequest = await this.friendshipRepo.findExistingRequest(
            meId,
            friendId,
        );
        if (existingRequest) {
            if (existingRequest.status === 'pending') {
                throw new ApiError(400, ErrorMessages.FRIENDSHIP.REQUEST_ALREADY_SENT);
            }
            await this.friendshipRepo.rejectRequest(
                existingRequest._id.toString(),
            );
        }

        const reqDoc = await this.friendshipRepo.createRequest(meId, friendId);

        const requestPayload = {
            _id: reqDoc._id.toString(),
            from: meUser.username,
            fromId: meId,
            createdAt:
                reqDoc.createdAt instanceof Date
                    ? reqDoc.createdAt.toISOString()
                    : new Date().toISOString(),
        };

        try {
            const io = getIO();
            const targetUsername = friendUser.username || '';
            const recipientSockets =
                this.presenceService.getSockets(targetUsername);

            if (recipientSockets) {
                recipientSockets.forEach((sid) =>
                    io.to(sid).emit('incoming_request_added', requestPayload),
                );
            }
        } catch (err) {
            this.logger.error(
                'Failed to emit incoming_request_added event:',
                err,
            );
        }

        return {
            message: 'friend request sent',
            request: reqDoc,
        };
    }

    @Post(':id/accept')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Accept a friend request' })
    @ApiResponse({ status: 201, type: AcceptFriendRequestResponseDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Request not found' })
    public async acceptFriendRequest(
        @Param('id') id: string,
        @Req() req: Request,
    ): Promise<AcceptFriendRequestResponseDTO> {
        const meId = (req as unknown as RequestWithUser).user.id;
        const meUser = await this.userRepo.findById(meId);
        if (!meUser) {
            throw new ApiError(401, ErrorMessages.AUTH.UNAUTHORIZED);
        }

        const fr = await this.friendshipRepo.findRequestById(id);
        if (!fr) {
            throw new ApiError(404, ErrorMessages.FRIENDSHIP.REQUEST_NOT_FOUND);
        }

        // Verification of the recipient
        if (fr.toId?.toString() !== meId) {
            throw new ApiError(403, ErrorMessages.FRIENDSHIP.NOT_ALLOWED);
        }

        if (fr.status !== 'pending') {
            throw new ApiError(400, ErrorMessages.FRIENDSHIP.REQUEST_NOT_PENDING);
        }

        const fromId = fr.fromId?.toString() || '';
        const toId = fr.toId?.toString() || '';

        const [fromUser, toUser] = await Promise.all([
            this.userRepo.findById(fromId),
            this.userRepo.findById(toId),
        ]);

        if (!fromUser || !toUser) {
            throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        await this.friendshipRepo.create(fromId, toId);
        await this.friendshipRepo.create(toId, fromId);

        const fromFriendPayload = this.mapUserToFriendPayload(fromUser);
        const toFriendPayload = this.mapUserToFriendPayload(toUser);

        try {
            const io = getIO();
            const toUsername = toUser.username || '';
            const toSockets = this.presenceService.getSockets(toUsername);

            if (toSockets && fromFriendPayload) {
                toSockets.forEach((sid) => {
                    io.to(sid).emit('friend_added', {
                        friend: fromFriendPayload,
                    });
                    io.to(sid).emit('incoming_request_removed', {
                        from: fromUser.username,
                        fromId: fromFriendPayload?._id,
                    });
                });
            }

            const fromUsername = fromUser.username || '';
            const fromSockets = this.presenceService.getSockets(fromUsername);

            if (fromSockets && toFriendPayload) {
                fromSockets.forEach((sid) => {
                    io.to(sid).emit('friend_added', {
                        friend: toFriendPayload,
                    });
                });
            }
        } catch (err) {
            this.logger.error('Failed to emit friend_added events:', err);
        }

        await this.friendshipRepo.acceptRequest(id);

        return {
            message: 'friend request accepted',
            friend: fromFriendPayload,
        };
    }

    @Post(':id/reject')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Reject a friend request' })
    @ApiResponse({ status: 201, type: FriendshipMessageResponseDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Request not found' })
    public async rejectFriendRequest(
        @Param('id') id: string,
        @Req() req: Request,
    ): Promise<FriendshipMessageResponseDTO> {
        const meId = (req as unknown as RequestWithUser).user.id;
        const fr = await this.friendshipRepo.findRequestById(id);

        if (!fr) {
            throw new ApiError(404, ErrorMessages.FRIENDSHIP.REQUEST_NOT_FOUND);
        }

        // Verification of the recipient
        if (fr.toId?.toString() !== meId) {
            throw new ApiError(403, ErrorMessages.FRIENDSHIP.NOT_ALLOWED);
        }

        if (fr.status !== 'pending') {
            throw new ApiError(400, ErrorMessages.FRIENDSHIP.REQUEST_NOT_PENDING);
        }

        const success = await this.friendshipRepo.rejectRequest(id);
        if (!success) {
            throw new ApiError(404, ErrorMessages.FRIENDSHIP.REQUEST_NOT_FOUND);
        }

        return { message: 'friend request rejected' };
    }

    @Delete(':friendId')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Remove a friend' })
    @ApiResponse({ status: 200, type: FriendshipMessageResponseDTO })
    @ApiResponse({ status: 404, description: 'User Not Found' })
    public async removeFriend(
        @Param('friendId') friendId: string,
        @Req() req: Request,
    ): Promise<FriendshipMessageResponseDTO> {
        const meId = (req as unknown as RequestWithUser).user.id;

        const [friend, meUser] = await Promise.all([
            this.userRepo.findById(friendId),
            this.userRepo.findById(meId),
        ]);

        if (!friend) {
            throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        }
        if (!meUser) {
            throw new ApiError(401, ErrorMessages.AUTH.UNAUTHORIZED);
        }

        await this.friendshipRepo.remove(meId, friendId);

        try {
            const io = getIO();
            const mySockets = this.presenceService.getSockets(
                meUser.username || '',
            );
            if (mySockets) {
                mySockets.forEach((sid) =>
                    io.to(sid).emit('friend_removed', {
                        username: friend.username,
                        userId: friendId,
                    }),
                );
            }

            const friendSockets = this.presenceService.getSockets(
                friend.username || '',
            );
            if (friendSockets) {
                friendSockets.forEach((sid) =>
                    io.to(sid).emit('friend_removed', {
                        username: meUser.username,
                        userId: meId,
                    }),
                );
            }
        } catch (err) {
            this.logger.error('Failed to emit friend_removed event:', err);
        }

        return { message: 'Friend removed successfully' };
    }
}
