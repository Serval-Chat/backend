import { Types } from 'mongoose';
import { PresenceController } from '../PresenceController';

describe('PresenceController mute restrictions', () => {
    const userRepo = {
        updateCustomStatus: jest.fn(),
    };
    const friendshipRepo = {};
    const serverMemberRepo = {};
    const blockRepo = {};
    const muteRepo = {
        checkExpired: jest.fn().mockResolvedValue(undefined),
        findActiveByUserId: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('rejects muted users before changing websocket status', async () => {
        const userId = new Types.ObjectId().toHexString();
        muteRepo.findActiveByUserId.mockResolvedValue({
            _id: new Types.ObjectId(),
            userId: new Types.ObjectId(userId),
        });

        const controller = new PresenceController(
            userRepo as never,
            friendshipRepo as never,
            serverMemberRepo as never,
            blockRepo as never,
            muteRepo as never,
        );

        await expect(
            controller.onSetStatus({ status: 'quiet mode' }, {
                userId,
                username: 'alice',
            } as never),
        ).rejects.toThrow('FORBIDDEN');

        expect(userRepo.updateCustomStatus).not.toHaveBeenCalled();
    });
});
