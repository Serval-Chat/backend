/* eslint-disable @typescript-eslint/no-explicit-any */
import { PingService } from '../PingService';
import type { IPing } from '@/di/interfaces/IPingRepository';

const USER = '0244871598790672384';
const SENDER = '0265935371727011840';
const OTHER = '0265935371727011841';
const MSG_ID = '0362009044010926080';
const SERVER = '0314440862954160128';
const CHANNEL = '0314447146336124928';

const mentionMessage = {
    messageId: MSG_ID,
    text: 'hello',
    createdAt: '2026-09-25T22:54:41.894Z',
};

const basePingData = {
    type: 'mention' as const,
    sender: 'cat',
    senderId: SENDER,
    message: mentionMessage,
};

const makePing = (overrides: Record<string, unknown> = {}): IPing =>
    ({
        snowflakeId: MSG_ID,
        userId: USER,
        type: 'mention',
        sender: 'cat',
        senderId: SENDER,
        serverId: SERVER,
        channelId: CHANNEL,
        messageId: MSG_ID,
        message: mentionMessage,
        timestamp: new Date('2026-09-25T22:54:41.894Z'),
        ...overrides,
    }) as IPing;

type MockPingRepo = {
    findById: jest.Mock;
    findByUserId: jest.Mock;
    create: jest.Mock;
    exists: jest.Mock;
    delete: jest.Mock;
    deleteByChannelId: jest.Mock;
    deleteByServerId: jest.Mock;
    deleteBetweenUsers: jest.Mock;
    deleteOldPings: jest.Mock;
};

type MockFriendshipRepo = {
    areFriends: jest.Mock;
    findByUserId: jest.Mock;
};

const setupService = (): {
    service: PingService;
    pingRepo: MockPingRepo;
    friendshipRepo: MockFriendshipRepo;
} => {
    const pingRepo: MockPingRepo = {
        findById: jest.fn(),
        findByUserId: jest.fn(),
        create: jest.fn(),
        exists: jest.fn(),
        delete: jest.fn(),
        deleteByChannelId: jest.fn(),
        deleteByServerId: jest.fn(),
        deleteBetweenUsers: jest.fn(),
        deleteOldPings: jest.fn(),
    };
    const friendshipRepo: MockFriendshipRepo = {
        areFriends: jest.fn(),
        findByUserId: jest.fn(),
    };
    return {
        service: new PingService(pingRepo, friendshipRepo as any),
        pingRepo,
        friendshipRepo,
    };
};

describe('PingService - addPing', () => {
    let service: PingService;
    let pingRepo: MockPingRepo;

    beforeEach(() => {
        const mocks = setupService();
        service = mocks.service;
        pingRepo = mocks.pingRepo;
    });

    it('returns a temporary notification without touching the repository when senderId is not a snowflake', async () => {
        const result = await service.addPing(USER, {
            ...basePingData,
            senderId: 'not-a-snowflake',
        });

        expect(result.id).toBe('temporary');
        expect(result.senderId).toBe('not-a-snowflake');
        expect(result.type).toBe('mention');
        expect(result.message).toEqual(mentionMessage);
        expect(typeof result.timestamp).toBe('number');
        expect(pingRepo.exists).not.toHaveBeenCalled();
        expect(pingRepo.create).not.toHaveBeenCalled();
    });

    it('returns a temporary notification when the message carries no snowflake messageId', async () => {
        const result = await service.addPing(USER, {
            ...basePingData,
            message: {
                messageId: 'legacy-42',
                text: 'no id here',
                createdAt: '2026-09-25T22:54:41.894Z',
            },
        });

        expect(result.id).toBe('temporary');
        expect(pingRepo.exists).not.toHaveBeenCalled();
        expect(pingRepo.create).not.toHaveBeenCalled();
    });

    it('creates a ping without empty server and channel ids and maps the result', async () => {
        pingRepo.exists.mockResolvedValue(false);
        pingRepo.create.mockResolvedValue(
            makePing({
                serverId: undefined,
                channelId: undefined,
            }),
        );

        const result = await service.addPing(USER, {
            ...basePingData,
            serverId: '',
            channelId: '',
        });

        expect(pingRepo.exists).toHaveBeenCalledWith(USER, SENDER, MSG_ID);
        expect(pingRepo.create).toHaveBeenCalledWith({
            userId: USER,
            type: 'mention',
            sender: 'cat',
            senderId: SENDER,
            messageId: MSG_ID,
            message: mentionMessage,
        });
        expect(result).toEqual({
            id: MSG_ID,
            type: 'mention',
            sender: 'cat',
            senderId: SENDER,
            message: mentionMessage,
            timestamp: new Date('2026-09-25T22:54:41.894Z').getTime(),
        });
        expect(result.serverId).toBeUndefined();
        expect(result.channelId).toBeUndefined();
    });

    it('keeps server and channel ids when they are provided', async () => {
        pingRepo.exists.mockResolvedValue(false);
        pingRepo.create.mockResolvedValue(makePing());

        const result = await service.addPing(USER, {
            ...basePingData,
            serverId: SERVER,
            channelId: CHANNEL,
        });

        expect(pingRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                serverId: SERVER,
                channelId: CHANNEL,
            }),
        );
        expect(result.serverId).toBe(SERVER);
        expect(result.channelId).toBe(CHANNEL);
        expect(typeof result.timestamp).toBe('number');
    });

    it('returns the already-stored ping instead of creating a duplicate', async () => {
        pingRepo.exists.mockResolvedValue(true);
        pingRepo.findByUserId.mockResolvedValue([makePing()]);

        const result = await service.addPing(USER, {
            ...basePingData,
            serverId: SERVER,
            channelId: CHANNEL,
        });

        expect(result.id).toBe(MSG_ID);
        expect(pingRepo.create).not.toHaveBeenCalled();
        expect(pingRepo.findByUserId).toHaveBeenCalledWith(USER);
    });

    it('creates a ping when dedup reports a match but no stored ping is found', async () => {
        pingRepo.exists.mockResolvedValue(true);
        pingRepo.findByUserId.mockResolvedValue([
            makePing({ messageId: '0362009044010926081' }),
        ]);
        pingRepo.create.mockResolvedValue(makePing());

        const result = await service.addPing(USER, {
            ...basePingData,
            serverId: SERVER,
            channelId: CHANNEL,
        });

        expect(pingRepo.create).toHaveBeenCalled();
        expect(result.id).toBe(MSG_ID);
    });
});

describe('PingService - getPingsForUser', () => {
    let service: PingService;
    let pingRepo: MockPingRepo;
    let friendshipRepo: MockFriendshipRepo;

    beforeEach(() => {
        const mocks = setupService();
        service = mocks.service;
        pingRepo = mocks.pingRepo;
        friendshipRepo = mocks.friendshipRepo;
    });

    it('queries with the 7-day max age and drops DM pings from non-friends', async () => {
        const serverPing = makePing({
            snowflakeId: '0362009044010926081',
            senderId: OTHER,
        });
        const friendPing = makePing({
            snowflakeId: '0362009044010926082',
            senderId: SENDER,
            serverId: undefined,
            channelId: undefined,
        });
        const strangerPing = makePing({
            snowflakeId: '0362009044010926083',
            senderId: OTHER,
            serverId: undefined,
            channelId: undefined,
        });
        pingRepo.findByUserId.mockResolvedValue([
            serverPing,
            friendPing,
            strangerPing,
        ]);
        friendshipRepo.areFriends.mockImplementation(
            async (_u: string, s: string): Promise<boolean> => s === SENDER,
        );

        const result = await service.getPingsForUser(USER);

        expect(pingRepo.findByUserId).toHaveBeenCalledWith(
            USER,
            7 * 24 * 60 * 60 * 1000,
        );
        expect(friendshipRepo.areFriends).toHaveBeenCalledWith(USER, SENDER);
        expect(friendshipRepo.areFriends).toHaveBeenCalledWith(USER, OTHER);
        expect(pingRepo.deleteBetweenUsers).toHaveBeenCalledWith(USER, OTHER);
        expect(result.map((p): string => p.id)).toEqual([
            '0362009044010926081',
            '0362009044010926082',
        ]);
        expect(typeof result[1]?.timestamp).toBe('number');
    });

    it('keeps server pings without consulting friendships', async () => {
        pingRepo.findByUserId.mockResolvedValue([makePing()]);

        const result = await service.getPingsForUser(USER);

        expect(friendshipRepo.areFriends).not.toHaveBeenCalled();
        expect(pingRepo.deleteBetweenUsers).not.toHaveBeenCalled();
        expect(result).toHaveLength(1);
        expect(result[0]?.id).toBe(MSG_ID);
    });
});

describe('PingService - removals', () => {
    let service: PingService;
    let pingRepo: MockPingRepo;

    beforeEach(() => {
        const mocks = setupService();
        service = mocks.service;
        pingRepo = mocks.pingRepo;
    });

    it('scopes the repository delete to the requesting user', async () => {
        pingRepo.delete.mockResolvedValue(true);

        const result = await service.removePing(USER, MSG_ID);

        expect(pingRepo.delete).toHaveBeenCalledWith(MSG_ID, USER);
        expect(result).toBe(true);
    });

    it('clears channel, server and pairwise pings through the repository', async () => {
        pingRepo.deleteByChannelId.mockResolvedValue(2);
        pingRepo.deleteByServerId.mockResolvedValue(3);
        pingRepo.deleteBetweenUsers.mockResolvedValue(4);

        expect(await service.clearChannelPings(USER, CHANNEL)).toBe(2);
        expect(pingRepo.deleteByChannelId).toHaveBeenCalledWith(USER, CHANNEL);

        expect(await service.clearServerPings(USER, SERVER)).toBe(3);
        expect(pingRepo.deleteByServerId).toHaveBeenCalledWith(USER, SERVER);

        expect(await service.clearPingsBetweenUsers(USER, SENDER)).toBe(4);
        expect(pingRepo.deleteBetweenUsers).toHaveBeenCalledWith(USER, SENDER);
    });
});
