import { Types } from 'mongoose';

import { ErrorMessages } from '@/constants/errorMessages';

jest.mock('@/services/pushService', () => ({
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
        findExistingRequest: jest.fn(),
        rejectRequest: jest.fn(),
        createRequest: jest.fn(),
    };
    const mockMessageRepo = {};
    const mockWsServer = { broadcastToUser: jest.fn() };
    const mockLogger = { error: jest.fn() };
    const mockBlockRepo = { getActiveBlockFlags: jest.fn() };

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
        );
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
