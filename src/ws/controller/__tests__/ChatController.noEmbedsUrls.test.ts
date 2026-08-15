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

function makeWsUser(overrides: Partial<IWsUser> = {}): IWsUser {
    return {
        userId: SENDER_ID,
        username: 'testuser',
        isBot: false,
        ...overrides,
    } as IWsUser;
}

describe('ChatController wires noEmbedsUrls through to the persisted message', () => {
    let userRepo: { findById: jest.Mock };
    let friendshipRepo: { areFriends: jest.Mock };
    let messageRepo: { findById: jest.Mock; create: jest.Mock };
    let dmUnreadRepo: { increment: jest.Mock };
    let muteRepo: { findActiveByUserId: jest.Mock; checkExpired: jest.Mock };
    let transactionManager: { runInTransaction: jest.Mock };
    let wsServer: { broadcastToUser: jest.Mock };
    let searchService: { indexDmMessage: jest.Mock };
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
            create: jest.fn().mockImplementation(async (data) => ({
                ...data,
                _id: new Types.ObjectId(),
                snowflakeId: new Types.ObjectId().toString(),
                createdAt: new Date(),
            })),
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
            {
                processUserMessage: jest.fn().mockResolvedValue(undefined),
            } as any, // EmbedService
            redisService as any,
            searchService as any,
            warningRepo as any,
        );
        (chatController as any).wsServer = wsServer as any;
    });

    it('passes noEmbedsUrls from the payload to messageRepo.create', async () => {
        await chatController.onSendMessageDm(
            {
                receiverId: RECEIVER_ID,
                text: 'Check this out: https://example.com',
                noEmbedsUrls: ['https://example.com'],
            },
            makeWsUser(),
        );

        expect(messageRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                noEmbedsUrls: ['https://example.com'],
            }),
            null,
        );
    });

    it('passes undefined through when the payload has no noEmbedsUrls', async () => {
        await chatController.onSendMessageDm(
            { receiverId: RECEIVER_ID, text: 'hello' },
            makeWsUser(),
        );

        expect(messageRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({ noEmbedsUrls: undefined }),
            null,
        );
    });
});
