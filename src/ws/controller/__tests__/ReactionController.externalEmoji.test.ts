/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import { ReactionController } from '../ReactionController';
import type { IWsUser } from '@/ws/types';

const hex = () => new Types.ObjectId().toHexString();

const USER_ID = hex();
const SERVER_ID = hex();
const FOREIGN_SERVER_ID = hex();
const CHANNEL_ID = hex();
const MESSAGE_ID = hex();
const EMOJI_ID = hex();

function makeWsUser(overrides: Partial<IWsUser> = {}): IWsUser {
    return {
        userId: USER_ID,
        username: 'testuser',
        isBot: false,
        ...overrides,
    } as IWsUser;
}

function buildController(options: {
    emojiServerId: string;
    allowExternal: boolean;
}) {
    const messageRepo = {
        findById: jest.fn().mockResolvedValue({
            _id: new Types.ObjectId(MESSAGE_ID),
            serverId: SERVER_ID,
            channelId: CHANNEL_ID,
            senderId: USER_ID,
        }),
    };
    const reactionRepo = {
        addReaction: jest.fn().mockResolvedValue(undefined),
        removeReaction: jest.fn().mockResolvedValue(undefined),
    };
    const emojiRepo = {
        findById: jest.fn().mockResolvedValue({
            serverId: options.emojiServerId,
        }),
    };
    const permissionService = {
        hasChannelPermission: jest
            .fn()
            .mockImplementation(async (_s, _u, _c, perm: string) => {
                if (perm === 'useExternalEmojisAndStickers') {
                    return options.allowExternal;
                }
                return true;
            }),
        requireChannelPermission: jest.fn(async function (
            this: {
                hasChannelPermission: (...args: unknown[]) => Promise<boolean>;
            },
            serverId: unknown,
            userId: unknown,
            channelId: unknown,
            permission: unknown,
            error: Error,
        ) {
            if (
                (await this.hasChannelPermission(
                    serverId,
                    userId,
                    channelId,
                    permission,
                )) !== true
            ) {
                throw error;
            }
        }),
    };
    const userRepo = { findById: jest.fn().mockResolvedValue(null) };
    const blockRepo = { getActiveBlockFlags: jest.fn().mockResolvedValue(0) };
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
        emojiRepo as any,
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

    return { controller, reactionRepo };
}

describe('ReactionController (WS) external emoji permission', () => {
    it('allows a custom emoji belonging to the same server', async () => {
        const { controller, reactionRepo } = buildController({
            emojiServerId: SERVER_ID,
            allowExternal: false,
        });

        await controller.onAddReaction(
            {
                messageId: MESSAGE_ID,
                emoji: 'wave',
                emojiType: 'custom',
                emojiId: EMOJI_ID,
                messageType: 'server',
            },
            makeWsUser(),
        );

        expect(reactionRepo.addReaction).toHaveBeenCalled();
    });

    it('rejects a foreign-server emoji when the permission is denied', async () => {
        const { controller, reactionRepo } = buildController({
            emojiServerId: FOREIGN_SERVER_ID,
            allowExternal: false,
        });

        await expect(
            controller.onAddReaction(
                {
                    messageId: MESSAGE_ID,
                    emoji: 'wave',
                    emojiType: 'custom',
                    emojiId: EMOJI_ID,
                    messageType: 'server',
                },
                makeWsUser(),
            ),
        ).rejects.toThrow();
        expect(reactionRepo.addReaction).not.toHaveBeenCalled();
    });

    it('allows a foreign-server emoji when the permission is granted', async () => {
        const { controller, reactionRepo } = buildController({
            emojiServerId: FOREIGN_SERVER_ID,
            allowExternal: true,
        });

        await controller.onAddReaction(
            {
                messageId: MESSAGE_ID,
                emoji: 'wave',
                emojiType: 'custom',
                emojiId: EMOJI_ID,
                messageType: 'server',
            },
            makeWsUser(),
        );

        expect(reactionRepo.addReaction).toHaveBeenCalled();
    });
});
