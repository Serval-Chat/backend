import { Types } from 'mongoose';

import { ErrorMessages } from '@/constants/errorMessages';

jest.mock('@/services/PushService', () => ({
    notifyUser: jest.fn().mockResolvedValue(undefined),
}));

import { FriendshipController } from '../FriendshipController';

describe('FriendshipController', () => {
    const meId = new Types.ObjectId();
    const friendId = new Types.ObjectId();

    const req = { user: { id: meId.toHexString() } } as never;

    const mockUserRepo = {
        findById: jest.fn(),
        findByUsername: jest.fn(),
    };
    const mockFriendshipRepo = {
        areFriends: jest.fn(),
        findByUserId: jest.fn(),
        findExistingRequest: jest.fn(),
        findRequestById: jest.fn(),
        rejectRequest: jest.fn(),
        acceptRequest: jest.fn(),
        create: jest.fn(),
        createRequest: jest.fn(),
        remove: jest.fn(),
    };
    const mockMessageRepo = {
        findByConversation: jest.fn(),
    };
    const mockWsServer = {
        broadcastToUser: jest.fn(),
        isUserOnline: jest.fn().mockResolvedValue(false),
    };
    const mockLogger = { error: jest.fn() };
    const mockBlockRepo = { getActiveBlockFlags: jest.fn() };
    const mockPingService = { clearPingsBetweenUsers: jest.fn() };
    const mockDmUnreadRepo = { delete: jest.fn() };
    const mockWarningRepo = {
        hasUnacknowledged: jest.fn().mockResolvedValue(false),
    };

    let controller: FriendshipController;

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new FriendshipController(
            mockUserRepo as never,
            mockFriendshipRepo as never,
            mockMessageRepo as never,
            mockWsServer as never,
            mockLogger as never,
            mockBlockRepo as never,
            mockPingService as never,
            mockDmUnreadRepo as never,
            mockWarningRepo as never,
        );
    });

    describe('removeFriend', () => {
        it('removes friendship and cleans up pings and unread counts', async () => {
            const friendIdStr = friendId.toHexString();
            mockUserRepo.findById.mockResolvedValueOnce({
                _id: friendId,
                username: 'bob',
            }); // friend
            mockUserRepo.findById.mockResolvedValueOnce({
                _id: meId,
                username: 'alice',
            }); // me

            const result = await controller.removeFriend(friendIdStr, req);

            expect(result.message).toBe('Friend removed successfully');
            expect(mockFriendshipRepo.remove).toHaveBeenCalledWith(
                meId.toHexString(),
                friendIdStr,
            );
            expect(mockPingService.clearPingsBetweenUsers).toHaveBeenCalledWith(
                meId.toHexString(),
                friendIdStr,
            );
            expect(mockDmUnreadRepo.delete).toHaveBeenCalledWith(
                meId.toHexString(),
                friendIdStr,
            );
            expect(mockDmUnreadRepo.delete).toHaveBeenCalledWith(
                friendIdStr,
                meId.toHexString(),
            );
            expect(mockWsServer.broadcastToUser).toHaveBeenCalledTimes(2);
        });
    });

    describe('getFriends', () => {
        it('reports a friend who set themselves to offline/invisible as isOnline: false, even though they are actually connected', async () => {
            const invisibleFriendId = new Types.ObjectId();

            mockUserRepo.findById.mockImplementation(async (idStr: string) => {
                if (idStr === meId.toHexString()) {
                    return { _id: meId, snowflakeId: idStr, username: 'alice' };
                }
                if (idStr === invisibleFriendId.toHexString()) {
                    return {
                        _id: invisibleFriendId,
                        snowflakeId: idStr,
                        username: 'invisible-friend',
                        createdAt: new Date('2026-01-01T00:00:00.000Z'),
                        profilePicture: null,
                        customStatus: null,
                        presenceStatus: 'offline',
                    };
                }
                return null;
            });
            mockFriendshipRepo.findByUserId.mockResolvedValue([
                {
                    _id: new Types.ObjectId(),
                    userId: meId,
                    friendId: invisibleFriendId,
                    createdAt: new Date('2026-01-01T00:00:00.000Z'),
                },
            ]);
            mockMessageRepo.findByConversation.mockResolvedValue([]);
            mockWsServer.isUserOnline.mockResolvedValue(true);

            const result = await controller.getFriends(req);

            const invisibleFriend = result.find(
                (friend) => friend.username === 'invisible-friend',
            );
            expect(invisibleFriend).toBeDefined();
            expect(invisibleFriend?.isOnline).toBe(false);
        });

        it('puts a newly accepted friend without messages above older friends', async () => {
            const olderFriendId = new Types.ObjectId();
            const newerFriendId = new Types.ObjectId();
            const olderCreatedAt = new Date('2026-01-01T00:00:00.000Z');
            const newerCreatedAt = new Date('2026-02-01T00:00:00.000Z');

            mockUserRepo.findById.mockImplementation(async (idStr: string) => {
                if (idStr === meId.toHexString()) {
                    return { _id: meId, snowflakeId: idStr, username: 'alice' };
                }
                if (idStr === olderFriendId.toHexString()) {
                    return {
                        _id: olderFriendId,
                        snowflakeId: idStr,
                        username: 'older-friend',
                        createdAt: olderCreatedAt,
                        profilePicture: null,
                        customStatus: null,
                    };
                }
                if (idStr === newerFriendId.toHexString()) {
                    return {
                        _id: newerFriendId,
                        snowflakeId: idStr,
                        username: 'newer-friend',
                        createdAt: newerCreatedAt,
                        profilePicture: null,
                        customStatus: null,
                    };
                }
                return null;
            });
            mockFriendshipRepo.findByUserId.mockResolvedValue([
                {
                    _id: new Types.ObjectId(),
                    userId: meId,
                    friendId: olderFriendId,
                    createdAt: olderCreatedAt,
                },
                {
                    _id: new Types.ObjectId(),
                    userId: meId,
                    friendId: newerFriendId,
                    createdAt: newerCreatedAt,
                },
            ]);
            mockMessageRepo.findByConversation.mockResolvedValue([]);

            const result = await controller.getFriends(req);

            expect(result.map((friend) => friend.username)).toEqual([
                'newer-friend',
                'older-friend',
            ]);
        });
    });

    it('rejects friend requests targeting bot users', async () => {
        mockUserRepo.findById.mockResolvedValue({
            _id: meId,
            username: 'alice',
        });
        mockUserRepo.findByUsername.mockResolvedValue({
            _id: friendId,
            username: 'helper-bot',
            isBot: true,
        });

        await expect(
            controller.sendFriendRequest(req, { username: 'helper-bot' }),
        ).rejects.toMatchObject({
            status: 400,
            message: ErrorMessages.FRIENDSHIP.CANNOT_ADD_BOT,
        });

        expect(mockFriendshipRepo.createRequest).not.toHaveBeenCalled();
    });

    it('still allows valid human friend requests', async () => {
        mockUserRepo.findById.mockResolvedValue({
            _id: meId,
            username: 'alice',
        });
        mockUserRepo.findByUsername.mockResolvedValue({
            _id: friendId,
            username: 'bob',
            isBot: false,
        });
        mockFriendshipRepo.areFriends.mockResolvedValue(false);
        mockFriendshipRepo.findExistingRequest.mockResolvedValue(null);
        mockBlockRepo.getActiveBlockFlags.mockResolvedValue(0);
        mockFriendshipRepo.createRequest.mockResolvedValue({
            _id: new Types.ObjectId(),
            fromId: meId,
            toId: friendId,
            status: 'pending',
            createdAt: new Date(),
        });

        const result = await controller.sendFriendRequest(req, {
            username: 'bob',
        });
        expect(result.message).toBe('friend request sent');
        expect(mockFriendshipRepo.createRequest).toHaveBeenCalled();
    });
});
