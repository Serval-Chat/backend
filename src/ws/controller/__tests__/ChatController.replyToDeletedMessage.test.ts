/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import { ChatController } from '../ChatController';
import type { IWsUser } from '@/ws/types';

jest.mock('@/services/PushService', () => ({
    notifyUser: jest.fn().mockResolvedValue(undefined),
    notifyUsers: jest.fn().mockResolvedValue(undefined),
}));

const hex = () => new Types.ObjectId().toHexString();

const SENDER_ID = hex();
const RECEIVER_ID = hex();
const DELETED_MESSAGE_ID = hex();

function makeWsUser(overrides: Partial<IWsUser> = {}): IWsUser {
    return {
        userId: SENDER_ID,
        username: 'testuser',
        isBot: false,
        ...overrides,
    } as IWsUser;
}

describe('ChatController rejects replying to a deleted message', () => {
    let messageRepo: { findById: jest.Mock; create: jest.Mock };
    let chatController: ChatController;

    beforeEach(() => {
        const userRepo = {
            findById: jest.fn().mockResolvedValue({
                _id: new Types.ObjectId(RECEIVER_ID),
                username: 'peer',
            }),
        };
        const friendshipRepo = {
            areFriends: jest.fn().mockResolvedValue(true),
        };
        messageRepo = {
            findById: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation(async (data) => ({
                ...data,
                _id: new Types.ObjectId(),
                snowflakeId: new Types.ObjectId().toString(),
                createdAt: new Date(),
            })),
        };
        const dmUnreadRepo = { increment: jest.fn().mockResolvedValue(1) };
        const muteRepo = {
            findActiveByUserId: jest.fn().mockResolvedValue(null),
            checkExpired: jest.fn().mockResolvedValue(undefined),
        };
        const transactionManager = {
            runInTransaction: jest.fn().mockImplementation((fn) => fn(null)),
        };
        const wsServer = { broadcastToUser: jest.fn() };
        const searchService = {
            indexDmMessage: jest.fn().mockResolvedValue(undefined),
        };
        const redisService = {
            getClient: jest.fn().mockReturnValue({
                setex: jest.fn().mockResolvedValue('OK'),
            }),
        };
        const warningRepo = {
            hasUnacknowledged: jest.fn().mockResolvedValue(false),
        };

        chatController = new ChatController(
            userRepo as any,
            messageRepo as any,
            dmUnreadRepo as any,
            friendshipRepo as any,
            muteRepo as any,
            transactionManager,
            {
                processUserMessage: jest.fn().mockResolvedValue(undefined),
            } as any, // EmbedService
            redisService as any,
            searchService as any,
            warningRepo as any,
            {
                getOrCreateDmChannel: jest
                    .fn()
                    .mockResolvedValue({ snowflakeId: 'dm-channel-1' }),
            } as any, // ChannelService
        );
        (chatController as any).wsServer = wsServer as any;
    });

    it('does not create a message replying to a deleted (or nonexistent) message', async () => {
        await expect(
            chatController.onSendMessageDm(
                {
                    receiverId: RECEIVER_ID,
                    text: 'still able to reply?',
                    replyToId: DELETED_MESSAGE_ID,
                },
                makeWsUser(),
            ),
        ).rejects.toThrow();

        expect(messageRepo.create).not.toHaveBeenCalled();
    });
});
