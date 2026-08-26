/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    ForbiddenException,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { UserChannelController } from '../UserChannelController';

const mockUserRepo = {
    findById: jest.fn(),
};
const mockFriendshipRepo = {
    areFriends: jest.fn(),
};
const mockChannelService = {
    getOrCreateDmChannel: jest.fn(),
};

function buildController(): UserChannelController {
    return new UserChannelController(
        mockUserRepo as any,
        mockFriendshipRepo as any,
        mockChannelService as any,
    );
}

describe('UserChannelController - createDmChannel', () => {
    let controller: UserChannelController;
    const userId = 'userA';
    const recipientId = 'userB';

    beforeEach(() => {
        jest.clearAllMocks();
        controller = buildController();
    });

    it('creates a DM channel with a friend', async () => {
        mockUserRepo.findById.mockResolvedValue({ snowflakeId: recipientId });
        mockFriendshipRepo.areFriends.mockResolvedValue(true);
        mockChannelService.getOrCreateDmChannel.mockResolvedValue({
            snowflakeId: 'chan1',
            type: 'dm',
            recipientIds: [userId, recipientId].sort(),
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            lastMessageAt: undefined,
        });

        const result = await controller.createDmChannel(userId, {
            recipientId,
        });

        expect(mockChannelService.getOrCreateDmChannel).toHaveBeenCalledWith(
            userId,
            recipientId,
        );
        expect(result.id).toBe('chan1');
        expect(result.lastMessageAt).toBeNull();
    });

    it('rejects when the recipient does not exist', async () => {
        mockUserRepo.findById.mockResolvedValue(null);

        await expect(
            controller.createDmChannel(userId, { recipientId }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(mockChannelService.getOrCreateDmChannel).not.toHaveBeenCalled();
    });

    it('rejects when trying to DM yourself', async () => {
        mockUserRepo.findById.mockResolvedValue({ snowflakeId: userId });

        await expect(
            controller.createDmChannel(userId, { recipientId: userId }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(mockChannelService.getOrCreateDmChannel).not.toHaveBeenCalled();
    });

    it('rejects when the users are not friends', async () => {
        mockUserRepo.findById.mockResolvedValue({ snowflakeId: recipientId });
        mockFriendshipRepo.areFriends.mockResolvedValue(false);

        await expect(
            controller.createDmChannel(userId, { recipientId }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(mockChannelService.getOrCreateDmChannel).not.toHaveBeenCalled();
    });
});
