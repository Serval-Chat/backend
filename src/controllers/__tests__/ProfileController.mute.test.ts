import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ProfileController } from '../ProfileController';

describe('ProfileController mute restrictions', () => {
    const userRepo = {
        findById: jest.fn(),
        updateCustomStatus: jest.fn(),
    };
    const logger = {
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
    };
    const muteRepo = {
        checkExpired: jest.fn().mockResolvedValue(undefined),
        findActiveByUserId: jest.fn(),
    };

    function createController() {
        return new ProfileController(
            userRepo as never,
            logger as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            muteRepo as never,
        );
    }

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('rejects muted users before changing custom status', async () => {
        const userId = new Types.ObjectId().toHexString();
        muteRepo.findActiveByUserId.mockResolvedValue({
            _id: new Types.ObjectId(),
            userId: new Types.ObjectId(userId),
        });

        await expect(
            createController().updateCustomStatus(
                {
                    user: { id: userId, username: 'alice' },
                } as never,
                { text: 'busy' },
            ),
        ).rejects.toThrow(ForbiddenException);

        expect(userRepo.findById).not.toHaveBeenCalled();
        expect(userRepo.updateCustomStatus).not.toHaveBeenCalled();
    });
});
