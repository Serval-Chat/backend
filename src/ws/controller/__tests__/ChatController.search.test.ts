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
const MSG_ID = hex();

function makeWsUser(overrides: Partial<IWsUser> = {}): IWsUser {
    return {
        userId: SENDER_ID,
        username: 'testuser',
        isBot: false,
        ...overrides,
    } as IWsUser;
}

describe('ChatController search indexing', () => {
    let userRepo: { findById: jest.Mock };
    let friendshipRepo: { areFriends: jest.Mock };
    let messageRepo: {
        findById: jest.Mock;
        create: jest.Mock;
        delete: jest.Mock;
    };
    let dmUnreadRepo: { increment: jest.Mock };
    let muteRepo: { findActiveByUserId: jest.Mock; checkExpired: jest.Mock };
    let transactionManager: { runInTransaction: jest.Mock };
    let wsServer: { broadcastToUser: jest.Mock };
    let searchService: {
        indexDmMessage: jest.Mock;
        removeDmMessage: jest.Mock;
    };
    let redisService: { getClient: jest.Mock };
    let warningRepo: { hasUnacknowledged: jest.Mock };
    let chatController: ChatController;

    beforeEach(() => {
        userRepo = {
            findById: jest.fn().mockResolvedValue({
                _id: new Types.ObjectId(RECEIVER_ID),
                username: 'peer',
            }),
        };
        friendshipRepo = { areFriends: jest.fn().mockResolvedValue(true) };
        messageRepo = {
            findById: jest.fn(),
            create: jest.fn(),
            delete: jest.fn().mockResolvedValue(true),
        };
        dmUnreadRepo = { increment: jest.fn().mockResolvedValue(1) };
        muteRepo = {
            findActiveByUserId: jest.fn().mockResolvedValue(null),
            checkExpired: jest.fn().mockResolvedValue(undefined),
        };
        transactionManager = {
            runInTransaction: jest.fn().mockImplementation((fn) => fn(null)),
        };
        wsServer = { broadcastToUser: jest.fn() };
        searchService = {
            indexDmMessage: jest.fn().mockResolvedValue(undefined),
            removeDmMessage: jest.fn().mockResolvedValue(undefined),
        };
        redisService = {
            getClient: jest.fn().mockReturnValue({
                setex: jest.fn().mockResolvedValue('OK'),
            }),
        };
        warningRepo = {
            hasUnacknowledged: jest.fn().mockResolvedValue(false),
        };

        chatController = new ChatController(
            userRepo as any,
            messageRepo as any,
            dmUnreadRepo as any,
            friendshipRepo as any,
            muteRepo as any,
            transactionManager,
            {} as any, // EmbedService
            redisService as any,
            searchService as any,
            warningRepo as any,
        );
        (chatController as any).wsServer = wsServer as any;
    });

    it("indexes the DM message with the sender's bot status when the sender is a bot", async () => {
        messageRepo.create.mockImplementation(async (data) => ({
            ...data,
            _id: new Types.ObjectId(MSG_ID),
            createdAt: new Date(),
        }));

        await chatController.onSendMessageDm(
            { receiverId: RECEIVER_ID, text: 'hello' },
            makeWsUser({ isBot: true }),
        );

        expect(searchService.indexDmMessage).toHaveBeenCalledWith(
            expect.objectContaining({ _id: new Types.ObjectId(MSG_ID) }),
            true,
        );
    });

    it('indexes the DM message with isBot=false for a regular human sender', async () => {
        messageRepo.create.mockImplementation(async (data) => ({
            ...data,
            _id: new Types.ObjectId(MSG_ID),
            createdAt: new Date(),
        }));

        await chatController.onSendMessageDm(
            { receiverId: RECEIVER_ID, text: 'hello' },
            makeWsUser({ isBot: false }),
        );

        expect(searchService.indexDmMessage).toHaveBeenCalledWith(
            expect.objectContaining({ _id: new Types.ObjectId(MSG_ID) }),
            false,
        );
    });

    it('removes the DM message from the index on delete', async () => {
        messageRepo.findById.mockResolvedValue({
            _id: new Types.ObjectId(MSG_ID),
            senderId: new Types.ObjectId(SENDER_ID),
            receiverId: new Types.ObjectId(RECEIVER_ID),
        });

        await chatController.onDeleteMessageDm(
            { messageId: MSG_ID },
            makeWsUser(),
        );

        expect(searchService.removeDmMessage).toHaveBeenCalledWith(MSG_ID);
    });
});
