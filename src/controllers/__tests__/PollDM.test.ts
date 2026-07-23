/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */
import { UserMessageController } from '../UserMessageController';
import { ChatController } from '@/ws/controller/ChatController';
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import type { Request } from 'express';
import type { IMessage } from '@/di/interfaces/IMessageRepository';
import type { ILogger } from '@/di/interfaces/ILogger';
import type { IPoll, IPollOption } from '@/models/Message';
import type { IWsUser } from '@/ws/types';

jest.mock('@/services/PushService', () => ({
    notifyUser: jest.fn().mockResolvedValue(undefined),
    notifyUsers: jest.fn().mockResolvedValue(undefined),
}));

const hex = () => new Types.ObjectId().toHexString();

const USER_ID = hex();
const PEER_ID = hex();
const MSG_ID = hex();

function makePoll(overrides: Partial<IPoll> = {}): IPoll {
    return {
        title: 'Dinner tonight?',
        multiSelect: false,
        options: [
            { id: hex(), text: 'Pizza', votes: [] },
            { id: hex(), text: 'Sushi', votes: [] },
        ] as IPollOption[],
        ...overrides,
    };
}

function makeDmMessage(poll: IPoll | undefined = makePoll()): IMessage {
    return {
        _id: new Types.ObjectId(MSG_ID),
        senderId: USER_ID,
        receiverId: PEER_ID,
        text: 'Check this poll',
        createdAt: new Date(),
        poll,
    } as IMessage;
}

function makeReq(userId = USER_ID): Request {
    return {
        user: { id: userId, username: 'testuser', isBot: false },
    } as Request;
}

function applyPollVote(
    poll: IPoll,
    userId: string,
    optionIds: string[],
): IPoll {
    return {
        ...poll,
        options: poll.options.map((opt) => {
            const votes = opt.votes.filter((v) => v.toString() !== userId);
            if (optionIds.includes(opt.id)) {
                votes.push(userId);
            }
            return { ...opt, votes };
        }),
    };
}

function makeWsUser(userId = USER_ID): IWsUser {
    return { userId, username: 'testuser', isBot: false } as IWsUser;
}

describe('DM Polls', () => {
    let userRepo: {
        findById: jest.Mock;
    };
    let friendshipRepo: {
        areFriends: jest.Mock;
    };
    let messageRepo: {
        findById: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
        setPollVote: jest.Mock;
        findByConversation: jest.Mock;
    };
    let dmUnreadRepo: {
        increment: jest.Mock;
        reset: jest.Mock;
        findByUser: jest.Mock;
    };
    let reactionRepo: {
        getReactionsForMessages: jest.Mock;
    };
    let wsServer: {
        broadcastToUser: jest.Mock;
        on: jest.Mock;
    };
    let logger: ILogger;
    let transactionManager: {
        runInTransaction: jest.Mock;
    };

    let userMessageController: UserMessageController;
    let chatController: ChatController;

    beforeEach(() => {
        userRepo = {
            findById: jest.fn().mockResolvedValue({
                _id: new Types.ObjectId(PEER_ID),
                username: 'peeruser',
            }),
        };
        friendshipRepo = {
            areFriends: jest.fn().mockResolvedValue(true),
        };
        messageRepo = {
            findById: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            setPollVote: jest.fn(),
            findByConversation: jest.fn().mockResolvedValue([]),
        };
        dmUnreadRepo = {
            increment: jest.fn().mockResolvedValue(1),
            reset: jest.fn().mockResolvedValue(undefined),
            findByUser: jest.fn().mockResolvedValue([]),
        };
        reactionRepo = {
            getReactionsForMessages: jest.fn().mockResolvedValue({}),
        };
        wsServer = {
            broadcastToUser: jest.fn(),
            on: jest.fn(),
        };
        logger = {
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
        };
        transactionManager = {
            runInTransaction: jest.fn().mockImplementation((fn) => fn(null)),
        };

        userMessageController = new UserMessageController(
            userRepo as any,
            friendshipRepo as any,
            messageRepo as any,
            dmUnreadRepo as any,
            reactionRepo as any,
            logger,
            wsServer as any,
            {} as any,
            { removeDmMessage: jest.fn().mockResolvedValue(undefined) } as any,
        );

        chatController = new ChatController(
            userRepo as any,
            messageRepo as any,
            dmUnreadRepo as any,
            friendshipRepo as any,
            {
                findActiveByUserId: jest.fn().mockResolvedValue(null),
                checkExpired: jest.fn().mockResolvedValue(undefined),
            } as any, // MuteRepository
            transactionManager,
            {} as any, // EmbedService
            {
                getClient: jest.fn().mockReturnValue({
                    setex: jest.fn().mockResolvedValue('OK'),
                }),
            } as any, // RedisService
            {
                indexDmMessage: jest.fn().mockResolvedValue(undefined),
                removeDmMessage: jest.fn().mockResolvedValue(undefined),
            } as any,
            { hasUnacknowledged: jest.fn().mockResolvedValue(false) } as any, // WarningRepository
        );
        (chatController as any).wsServer = wsServer;
    });

    describe('ChatController.onSendMessageDm (Poll Creation)', () => {
        it('should correctly initialize a poll when sending a DM', async () => {
            const pollData = {
                title: 'Party?',
                options: [{ text: 'Yes' }, { text: 'No' }],
                multiSelect: false,
            };

            let capturedMessage: IMessage = {} as any;
            messageRepo.create.mockImplementation(async (data) => {
                capturedMessage = data;
                return {
                    ...data,
                    _id: new Types.ObjectId(MSG_ID),
                    createdAt: new Date(),
                };
            });

            await chatController.onSendMessageDm(
                { receiverId: PEER_ID, text: 'Vote!', poll: pollData },
                makeWsUser(),
            );

            expect(messageRepo.create).toHaveBeenCalled();
            expect(capturedMessage.poll).toBeDefined();
            expect(capturedMessage.poll!.title).toBe('Party?');
            expect(capturedMessage.poll!.options).toHaveLength(2);
            expect(capturedMessage.poll!.options[0]!.id).toBeDefined();
            expect(capturedMessage.poll!.options[0]!.votes).toEqual([]);
        });

        it('should parse expiresAt string into Date', async () => {
            const expiresAt = new Date(Date.now() + 10000).toISOString();
            const pollData = {
                title: 'Party?',
                options: [{ text: 'Yes' }],
                multiSelect: false,
                expiresAt,
            };

            let capturedMessage: IMessage = {} as any;
            messageRepo.create.mockImplementation(async (data) => {
                capturedMessage = data;
                return {
                    ...data,
                    _id: new Types.ObjectId(MSG_ID),
                    createdAt: new Date(),
                };
            });

            await chatController.onSendMessageDm(
                { receiverId: PEER_ID, text: 'Vote!', poll: pollData as any },
                makeWsUser(),
            );

            expect(capturedMessage.poll!.expiresAt).toBeInstanceOf(Date);
            expect(capturedMessage.poll!.expiresAt!.toISOString()).toBe(
                expiresAt,
            );
        });
    });

    describe('UserMessageController.votePoll (REST)', () => {
        beforeEach(() => {});

        afterEach(() => {});

        it('should register a vote on a DM poll', async () => {
            const poll = makePoll();
            const msg = makeDmMessage(poll);
            messageRepo.findById.mockResolvedValue(msg);

            const targetOptionId = poll.options[0]!.id;
            const updatedMsg = {
                ...msg,
                poll: applyPollVote(poll, USER_ID, [targetOptionId]),
            };
            messageRepo.setPollVote.mockResolvedValue(updatedMsg);

            const result = await userMessageController.votePoll(
                { id: MSG_ID },
                makeReq().user?.id as string,
                { optionIds: [targetOptionId] },
            );

            expect(result).toBeDefined();
            expect(messageRepo.setPollVote).toHaveBeenCalledWith(
                MSG_ID,
                USER_ID,
                [targetOptionId],
            );
            expect(wsServer.broadcastToUser).toHaveBeenCalledWith(
                USER_ID,
                expect.objectContaining({ type: 'poll_vote_updated_dm' }),
            );
            expect(wsServer.broadcastToUser).toHaveBeenCalledWith(
                PEER_ID,
                expect.objectContaining({ type: 'poll_vote_updated_dm' }),
            );
        });

        it('should throw BadRequestException if poll is expired', async () => {
            const poll = makePoll({ expiresAt: new Date(Date.now() - 10000) });
            messageRepo.findById.mockResolvedValue(makeDmMessage(poll));

            await expect(
                userMessageController.votePoll(
                    { id: MSG_ID },
                    makeReq().user?.id as string,
                    {
                        optionIds: [poll.options[0]!.id],
                    },
                ),
            ).rejects.toThrow(BadRequestException);
        });

        it('should throw BadRequestException if multiple options selected on single-select poll', async () => {
            const poll = makePoll({ multiSelect: false });
            messageRepo.findById.mockResolvedValue(makeDmMessage(poll));

            await expect(
                userMessageController.votePoll(
                    { id: MSG_ID },
                    makeReq().user?.id as string,
                    {
                        optionIds: [poll.options[0]!.id, poll.options[1]!.id],
                    },
                ),
            ).rejects.toThrow(BadRequestException);
        });
    });
});
