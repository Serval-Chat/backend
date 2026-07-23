import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { Bot } from '@/models/Bot';
import { UserConnection } from '@/models/UserConnection';
import { ProfileController } from '../ProfileController';

jest.mock('@/models/Bot', () => ({
    Bot: {
        findOne: jest.fn(),
    },
}));

jest.mock('@/models/UserConnection', () => ({
    UserConnection: {
        find: jest.fn(),
    },
}));

describe('ProfileController mute restrictions', () => {
    const userRepo = {
        findById: jest.fn(),
        updateCustomStatus: jest.fn(),
    };
    const serverMemberRepo = {
        findServerIdsByUserId: jest.fn(),
    };
    const friendshipRepo = {
        areFriends: jest.fn().mockResolvedValue(false),
    };
    const blockRepo = {
        getActiveBlockFlags: jest.fn(),
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
    const warningRepo = {
        hasUnacknowledged: jest.fn().mockResolvedValue(false),
    };

    function createController() {
        return new ProfileController(
            userRepo as never,
            logger as never,
            serverMemberRepo as never,
            friendshipRepo as never,
            {} as never,
            {} as never,
            blockRepo as never,
            {} as never,
            muteRepo as never,
            warningRepo as never,
        );
    }

    beforeEach(() => {
        jest.clearAllMocks();
        blockRepo.getActiveBlockFlags.mockResolvedValue(0);
        friendshipRepo.areFriends.mockResolvedValue(false);
        warningRepo.hasUnacknowledged.mockResolvedValue(false);
        (UserConnection.find as jest.Mock).mockReturnValue({
            sort: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([]),
            }),
        });
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

    it('rejects users with an unacknowledged warning before changing custom status', async () => {
        const userId = new Types.ObjectId().toHexString();
        muteRepo.findActiveByUserId.mockResolvedValue(null);
        warningRepo.hasUnacknowledged.mockResolvedValue(true);

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

    it('rejects bot profile reads when readUsers is disabled', async () => {
        const botUserId = new Types.ObjectId();
        const targetUserId = new Types.ObjectId();
        userRepo.findById.mockResolvedValue({
            _id: targetUserId,
            username: 'target',
            createdAt: new Date(),
        });
        (Bot.findOne as jest.Mock).mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                botPermissions: { readUsers: false },
            }),
        });

        await expect(
            createController().getUserProfileResponseDTO(
                targetUserId.toHexString(),
                {
                    user: {
                        id: botUserId.toHexString(),
                        username: 'bot',
                        isBot: true,
                    },
                } as never,
            ),
        ).rejects.toMatchObject({
            status: 403,
            message: 'Bot does not have readUsers permission',
        });

        expect(serverMemberRepo.findServerIdsByUserId).not.toHaveBeenCalled();
    });

    it('allows bot profile reads when readUsers is enabled and a server is shared', async () => {
        const sharedServerId = new Types.ObjectId();
        const botUserId = new Types.ObjectId();
        const targetUserId = new Types.ObjectId();
        userRepo.findById.mockResolvedValue({
            _id: targetUserId,
            snowflakeId: targetUserId.toHexString(),
            username: 'target',
            displayName: 'Target User',
            createdAt: new Date(),
        });
        (Bot.findOne as jest.Mock).mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                botPermissions: { readUsers: true },
            }),
        });
        serverMemberRepo.findServerIdsByUserId
            .mockResolvedValueOnce([sharedServerId])
            .mockResolvedValueOnce([sharedServerId]);

        const profile = await createController().getUserProfileResponseDTO(
            targetUserId.toHexString(),
            {
                user: {
                    id: botUserId.toHexString(),
                    username: 'bot',
                    isBot: true,
                },
            } as never,
        );

        expect(profile.id).toBe(targetUserId.toHexString());
        expect(profile.username).toBe('target');
        expect(Bot.findOne).toHaveBeenCalledWith({
            userId: botUserId.toHexString(),
        });
        expect(serverMemberRepo.findServerIdsByUserId).toHaveBeenCalledTimes(2);
    });
});
