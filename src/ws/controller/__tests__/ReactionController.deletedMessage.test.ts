/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import { ReactionController } from '../ReactionController';
import type { IWsUser } from '@/ws/types';

const hex = () => new Types.ObjectId().toHexString();

const USER_ID = hex();
const OTHER_USER_ID = hex();
const DELETED_MESSAGE_ID = hex();

function makeWsUser(overrides: Partial<IWsUser> = {}): IWsUser {
    return {
        userId: USER_ID,
        username: 'testuser',
        isBot: false,
        ...overrides,
    } as IWsUser;
}

function buildController() {
    const messageRepo = {
        findById: jest.fn().mockResolvedValue(null),
    };
    const reactionRepo = {
        addReaction: jest.fn().mockResolvedValue(undefined),
        removeReaction: jest.fn().mockResolvedValue(undefined),
    };
    const permissionService = {
        hasChannelPermission: jest.fn().mockResolvedValue(true),
    };
    const userRepo = {
        findById: jest.fn().mockResolvedValue(null),
    };
    const blockRepo = {
        getActiveBlockFlags: jest.fn().mockResolvedValue(0),
    };
    const muteRepo = {
        findActiveByUserId: jest.fn().mockResolvedValue(null),
        checkExpired: jest.fn().mockResolvedValue(undefined),
    };
    const warningRepo = {
        hasUnacknowledged: jest.fn().mockResolvedValue(false),
    };

    const controller = new ReactionController(
        messageRepo as any,
        reactionRepo as any,
        permissionService as any,
        userRepo as any,
        blockRepo as any,
        muteRepo as any,
        warningRepo as any,
    );
    (controller as any).wsServer = {
        broadcastToUser: jest.fn(),
        broadcastToChannel: jest.fn(),
        broadcastToServerWithPermission: jest.fn().mockResolvedValue(undefined),
    };

    return { controller, messageRepo, reactionRepo };
}

describe('ReactionController rejects reacting to a deleted message', () => {
    it('add_reaction on a deleted DM message is rejected', async () => {
        const { controller, messageRepo, reactionRepo } = buildController();

        await expect(
            controller.onAddReaction(
                {
                    messageId: DELETED_MESSAGE_ID,
                    emoji: '👍',
                    emojiType: 'unicode',
                    messageType: 'dm',
                },
                makeWsUser(),
            ),
        ).rejects.toThrow();

        expect(messageRepo.findById).toHaveBeenCalledWith(DELETED_MESSAGE_ID);
        expect(reactionRepo.addReaction).not.toHaveBeenCalled();
    });

    it('add_reaction on a deleted server message is rejected', async () => {
        const { controller, messageRepo, reactionRepo } = buildController();

        await expect(
            controller.onAddReaction(
                {
                    messageId: DELETED_MESSAGE_ID,
                    emoji: '👍',
                    emojiType: 'unicode',
                    messageType: 'server',
                },
                makeWsUser(),
            ),
        ).rejects.toThrow();

        expect(messageRepo.findById).toHaveBeenCalledWith(DELETED_MESSAGE_ID);
        expect(reactionRepo.addReaction).not.toHaveBeenCalled();
    });

    it('remove_reaction on a deleted DM message is rejected', async () => {
        const { controller, messageRepo, reactionRepo } = buildController();

        await expect(
            controller.onRemoveReaction(
                {
                    messageId: DELETED_MESSAGE_ID,
                    emoji: '👍',
                    emojiType: 'unicode',
                    messageType: 'dm',
                },
                makeWsUser(),
            ),
        ).rejects.toThrow();

        expect(messageRepo.findById).toHaveBeenCalledWith(DELETED_MESSAGE_ID);
        expect(reactionRepo.removeReaction).not.toHaveBeenCalled();
    });

    it('remove_reaction on a deleted server message is rejected', async () => {
        const { controller, messageRepo, reactionRepo } = buildController();

        await expect(
            controller.onRemoveReaction(
                {
                    messageId: DELETED_MESSAGE_ID,
                    emoji: '👍',
                    emojiType: 'unicode',
                    messageType: 'server',
                },
                makeWsUser({ userId: OTHER_USER_ID }),
            ),
        ).rejects.toThrow();

        expect(messageRepo.findById).toHaveBeenCalledWith(DELETED_MESSAGE_ID);
        expect(reactionRepo.removeReaction).not.toHaveBeenCalled();
    });
});

describe('ReactionController still allows reacting to a live message', () => {
    const LIVE_MESSAGE_ID = hex();

    it('add_reaction on a live DM message succeeds', async () => {
        const { controller, messageRepo, reactionRepo } = buildController();
        messageRepo.findById.mockResolvedValue({
            senderId: USER_ID,
            receiverId: OTHER_USER_ID,
        });

        await controller.onAddReaction(
            {
                messageId: LIVE_MESSAGE_ID,
                emoji: '👍',
                emojiType: 'unicode',
                messageType: 'dm',
            },
            makeWsUser(),
        );

        expect(reactionRepo.addReaction).toHaveBeenCalledWith(
            LIVE_MESSAGE_ID,
            'dm',
            USER_ID,
            '👍',
            'unicode',
            undefined,
        );
    });

    it('add_reaction on a live server message succeeds', async () => {
        const { controller, messageRepo, reactionRepo } = buildController();
        messageRepo.findById.mockResolvedValue({
            senderId: USER_ID,
            serverId: 'server-1',
            channelId: 'channel-1',
        });

        await controller.onAddReaction(
            {
                messageId: LIVE_MESSAGE_ID,
                emoji: '👍',
                emojiType: 'unicode',
                messageType: 'server',
            },
            makeWsUser(),
        );

        expect(reactionRepo.addReaction).toHaveBeenCalledWith(
            LIVE_MESSAGE_ID,
            'server',
            USER_ID,
            '👍',
            'unicode',
            undefined,
        );
    });
});
