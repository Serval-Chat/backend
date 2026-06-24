/* eslint-disable @typescript-eslint/no-explicit-any */
import { ServerController } from '@/ws/controller/ServerController';
import { Types } from 'mongoose';
import type { IWsUser } from '@/ws/types';

jest.mock('@/services/PushService', () => ({
    notifyUser: jest.fn().mockResolvedValue(undefined),
    notifyUsers: jest.fn().mockResolvedValue(undefined),
}));

const hex = () => new Types.ObjectId().toHexString();

const SERVER_ID = hex();
const CHANNEL_ID = hex();
const USER_ID = hex();
const MSG_ID = hex();

function makeWsUser(userId = USER_ID): IWsUser {
    return { userId, username: 'testuser', isBot: false } as IWsUser;
}

describe('Server WS Polls', () => {
    let serverRepo: {
        findById: jest.Mock;
    };
    let userRepo: {
        findById: jest.Mock;
    };
    let serverMessageRepo: {
        create: jest.Mock;
        findLastByChannelAndUser: jest.Mock;
    };
    let serverMemberRepo: {
        findByServerAndUser: jest.Mock;
        findByServerId: jest.Mock;
    };
    let channelRepo: {
        findById: jest.Mock;
        updateLastMessageAt: jest.Mock;
    };
    let serverChannelReadRepo: {
        upsert: jest.Mock;
    };
    let roleRepo: {
        findByServer: jest.Mock;
    };
    let permissionService: {
        hasChannelPermission: jest.Mock;
        hasPermission: jest.Mock;
    };
    let pingService: {
        processMentions: jest.Mock;
    };
    let transactionManager: {
        runInTransaction: jest.Mock;
    };
    let redisService: {
        getClient: jest.Mock;
    };
    let wsServer: {
        broadcastToChannel: jest.Mock;
        broadcastToServer: jest.Mock;
        broadcastToServerWithPermission: jest.Mock;
        subscribeToServer: jest.Mock;
        subscribeToChannel: jest.Mock;
        unsubscribeFromServer: jest.Mock;
        unsubscribeFromChannel: jest.Mock;
        on: jest.Mock;
    };
    let embedService: {
        processServerMessage: jest.Mock;
        processUserMessage: jest.Mock;
    };

    let serverController: ServerController;

    beforeEach(() => {
        serverRepo = { findById: jest.fn() };
        userRepo = { findById: jest.fn() };
        serverMessageRepo = {
            create: jest.fn(),
            findLastByChannelAndUser: jest.fn().mockResolvedValue(null),
        };
        serverMemberRepo = {
            findByServerAndUser: jest
                .fn()
                .mockResolvedValue({ userId: USER_ID }),
            findByServerId: jest.fn().mockResolvedValue([]),
        };
        channelRepo = {
            findById: jest.fn().mockResolvedValue({
                _id: new Types.ObjectId(CHANNEL_ID),
                serverId: new Types.ObjectId(SERVER_ID),
                type: 'text',
            }),
            updateLastMessageAt: jest.fn().mockResolvedValue(undefined),
        };
        serverChannelReadRepo = {
            upsert: jest.fn().mockResolvedValue(undefined),
        };
        roleRepo = { findByServer: jest.fn().mockResolvedValue([]) };
        permissionService = {
            hasChannelPermission: jest.fn().mockResolvedValue(true),
            hasPermission: jest.fn().mockResolvedValue(true),
        };
        pingService = { processMentions: jest.fn().mockResolvedValue([]) };
        transactionManager = {
            runInTransaction: jest.fn().mockImplementation((fn) => fn(null)),
        };
        redisService = {
            getClient: jest.fn().mockReturnValue({
                get: jest.fn().mockResolvedValue(null),
                setex: jest.fn().mockResolvedValue('OK'),
                set: jest.fn().mockResolvedValue('OK'),
                expire: jest.fn().mockResolvedValue(1),
                sadd: jest.fn().mockResolvedValue(1),
                srem: jest.fn().mockResolvedValue(1),
                del: jest.fn().mockResolvedValue(1),
                smembers: jest.fn().mockResolvedValue([]),
                hset: jest.fn().mockResolvedValue(1),
                hgetall: jest.fn().mockResolvedValue({}),
                scan: jest.fn().mockResolvedValue(['0', []]),
            }),
        };
        wsServer = {
            broadcastToChannel: jest.fn(),
            broadcastToServer: jest.fn(),
            broadcastToServerWithPermission: jest.fn(),
            subscribeToServer: jest.fn(),
            subscribeToChannel: jest.fn(),
            unsubscribeFromServer: jest.fn(),
            unsubscribeFromChannel: jest.fn(),
            on: jest.fn(),
        };
        embedService = {
            processServerMessage: jest.fn(),
            processUserMessage: jest.fn(),
        };

        serverController = new ServerController(
            serverRepo as any,
            userRepo as any,
            serverMessageRepo as any,
            serverMemberRepo as any,
            channelRepo as any,
            serverChannelReadRepo as any,
            roleRepo as any,
            permissionService as any,
            pingService as any,
            {
                findActiveByUserId: jest.fn().mockResolvedValue(null),
                checkExpired: jest.fn().mockResolvedValue(undefined),
            } as any, // MuteRepository
            transactionManager,
            redisService as any,
            embedService as any,
        );
        (serverController as any).wsServer = wsServer;
    });

    describe('ServerController.onSendMessageServer (Poll Creation)', () => {
        it('should correctly initialize a poll when sending a server message via WS', async () => {
            const pollData = {
                title: 'Next map?',
                options: [{ text: 'Dust2' }, { text: 'Inferno' }],
                multiSelect: false,
            };

            let capturedMessage: any;
            serverMessageRepo.create.mockImplementation(async (data: any) => {
                capturedMessage = data;
                return {
                    ...data,
                    _id: new Types.ObjectId(MSG_ID),
                    createdAt: new Date(),
                };
            });

            await serverController.onSendMessageServer(
                {
                    serverId: SERVER_ID,
                    channelId: CHANNEL_ID,
                    text: 'Vote!',
                    poll: pollData,
                },
                makeWsUser(),
            );

            expect(serverMessageRepo.create).toHaveBeenCalled();
            expect(capturedMessage.poll).toBeDefined();
            expect(capturedMessage.poll.title).toBe('Next map?');
            expect(capturedMessage.poll.options).toHaveLength(2);
            expect(capturedMessage.poll.options[0].id).toBeDefined();
            expect(capturedMessage.poll.options[0].votes).toEqual([]);
        });

        it('should parse expiresAt string into Date', async () => {
            const expiresAt = new Date(Date.now() + 3600000).toISOString();
            const pollData = {
                title: 'Next map?',
                options: [{ text: 'Dust2' }],
                multiSelect: false,
                expiresAt,
            };

            let capturedMessage: any;
            serverMessageRepo.create.mockImplementation(async (data: any) => {
                capturedMessage = data;
                return {
                    ...data,
                    _id: new Types.ObjectId(MSG_ID),
                    createdAt: new Date(),
                };
            });

            await serverController.onSendMessageServer(
                {
                    serverId: SERVER_ID,
                    channelId: CHANNEL_ID,
                    text: 'Vote!',
                    poll: pollData as any,
                },
                makeWsUser(),
            );

            expect(capturedMessage.poll.expiresAt).toBeInstanceOf(Date);
            expect(capturedMessage.poll.expiresAt.toISOString()).toBe(
                expiresAt,
            );
        });
    });
});
