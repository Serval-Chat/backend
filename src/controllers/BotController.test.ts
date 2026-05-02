import crypto from 'crypto';

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';

jest.mock('@/models/Bot', () => ({
    Bot: {
        findOne: jest.fn(),
        countDocuments: jest.fn(),
        create: jest.fn(),
        deleteOne: jest.fn(),
        findById: jest.fn(),
    },
    DEFAULT_BOT_PERMISSIONS: {
        readMessages: false,
        sendMessages: false,
        manageMessages: false,
        readUsers: false,
        joinServers: false,
        manageServer: false,
        manageChannels: false,
        manageMembers: false,
        readReactions: false,
        addReactions: false,
    },
}));

jest.mock('@/models/User', () => ({
    User: {
        findOne: jest.fn(),
        create: jest.fn(),
        findByIdAndUpdate: jest.fn(),
        findById: jest.fn(),
    },
}));

jest.mock('@/models/Server', () => ({
    Server: { findById: jest.fn() },
    ServerMember: {
        findOne: jest.fn(),
        create: jest.fn(),
        countDocuments: jest.fn(),
        deleteOne: jest.fn(),
        find: jest.fn(),
    },
    ServerBan: { findOne: jest.fn() },
    Role: { find: jest.fn(), findOne: jest.fn() },
}));

jest.mock('@/utils/jwt', () => ({
    generateJWT: jest.fn().mockReturnValue('mock.jwt.token'),
}));

import { Bot } from '@/models/Bot';
import { Server, ServerBan, ServerMember, Role } from '@/models/Server';
import { User } from '@/models/User';
import { BotController } from './BotController';

function makeChain(value: unknown) {
    return {
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(value),
    };
}

function sha256(input: string) {
    return crypto.createHash('sha256').update(input).digest('hex');
}

const OWNER_ID = new Types.ObjectId().toHexString();
const BOT_USER_ID = new Types.ObjectId().toHexString();
const SERVER_ID = new Types.ObjectId().toHexString();

const mockWsServer = { broadcastToServer: jest.fn() };
const mockSlashCommandRepo = {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findById: jest.fn(),
    findByBotId: jest.fn().mockResolvedValue([]),
    findAll: jest.fn().mockResolvedValue([]),
    deleteByBotId: jest.fn().mockResolvedValue(0),
};

const mockUserRepo = {
    findById: jest.fn(),
    update: jest.fn(),
    updateProfilePicture: jest.fn(),
    updateBanner: jest.fn(),
};

const mockServerMemberRepo = {
    findServerIdsByUserId: jest.fn().mockResolvedValue([]),
};

const mockRoleRepo = {
    create: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findMaxPositionByServerId: jest.fn(),
    findByServerId: jest.fn(),
};

const mockPermissionService = {
    invalidateCache: jest.fn(),
};

let controller: BotController;

beforeEach(() => {
    jest.clearAllMocks();
    controller = new BotController(
        mockWsServer as never,
        mockSlashCommandRepo as never,
        mockUserRepo as never,
        mockServerMemberRepo as never,
        mockRoleRepo as never,
        mockPermissionService as never,
    );
});

describe('getPublicInfo', () => {
    it('throws NotFoundException when bot does not exist', async () => {
        (Bot.findOne as jest.Mock).mockReturnValue(makeChain(null));
        await expect(controller.getPublicInfo('0123456789abcdef0123456789abcdef')).rejects.toThrow(
            NotFoundException,
        );
    });

    it('returns public bot info including server count', async () => {
        const botUserOid = new Types.ObjectId();
        (Bot.findOne as jest.Mock).mockReturnValue(
            makeChain({
                clientId: '0123456789abcdef0123456789abcdef',
                botPermissions: { readMessages: true, sendMessages: false },
                userId: {
                    _id: botUserOid,
                    username: 'mybot',
                    displayName: 'My Bot',
                    bio: 'A bot',
                    profilePicture: undefined,
                },
            }),
        );
        (ServerMember.countDocuments as jest.Mock).mockResolvedValue(7);

        const result = await controller.getPublicInfo('0123456789abcdef0123456789abcdef');

        expect(result.clientId).toBe('0123456789abcdef0123456789abcdef');
        expect(result.username).toBe('mybot');
        expect(result.displayName).toBe('My Bot');
        expect(result.serverCount).toBe(7);
    });
});

describe('getToken', () => {
    it('throws BadRequestException when client_id or client_secret missing', async () => {
        await expect(
            controller.getToken({ client_id: '', client_secret: 'x' }),
        ).rejects.toThrow(BadRequestException);

        await expect(
            controller.getToken({ client_id: 'x', client_secret: '' }),
        ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when bot does not exist', async () => {
        (Bot.findOne as jest.Mock).mockReturnValue(makeChain(null));
        await expect(
            controller.getToken({ client_id: '0123456789abcdef0123456789abcdef', client_secret: 'secret' }),
        ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when secret is wrong', async () => {
        (Bot.findOne as jest.Mock).mockReturnValue(
            makeChain({
                clientId: '0123456789abcdef0123456789abcdef',
                clientSecretHash: sha256('correct-secret'),
                userId: {
                    _id: new Types.ObjectId(),
                    username: 'bot',
                    tokenVersion: 0,
                    isBot: true,
                },
            }),
        );
        await expect(
            controller.getToken({ client_id: '0123456789abcdef0123456789abcdef', client_secret: 'wrong-secret' }),
        ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when bot account is disabled', async () => {
        const secret = 'valid-secret';
        (Bot.findOne as jest.Mock).mockReturnValue(
            makeChain({
                clientId: '0123456789abcdef0123456789abcdef',
                clientSecretHash: sha256(secret),
                userId: {
                    _id: new Types.ObjectId(),
                    username: 'bot',
                    tokenVersion: 0,
                    isBot: true,
                    deletedAt: new Date(),
                },
            }),
        );
        await expect(
            controller.getToken({ client_id: '0123456789abcdef0123456789abcdef', client_secret: secret }),
        ).rejects.toThrow(ForbiddenException);
    });

    it('returns a token on valid credentials', async () => {
        const secret = 'valid-secret';
        (Bot.findOne as jest.Mock).mockReturnValue(
            makeChain({
                clientId: '0123456789abcdef0123456789abcdef',
                clientSecretHash: sha256(secret),
                userId: {
                    _id: new Types.ObjectId(),
                    username: 'testbot',
                    tokenVersion: 1,
                    isBot: true,
                },
            }),
        );
        const result = await controller.getToken({
            client_id: '0123456789abcdef0123456789abcdef',
            client_secret: secret,
        });
        expect(result).toEqual({ token: 'mock.jwt.token' });
    });
});

describe('authorizeToServer', () => {
    const req = { user: { id: OWNER_ID } } as never;

    it('throws BadRequestException for invalid serverId', async () => {
        await expect(
            controller.authorizeToServer(req, '0123456789abcdef0123456789abcdef', {
                serverId: 'not-an-objectid',
            }),
        ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when bot does not exist', async () => {
        (Bot.findOne as jest.Mock).mockReturnValue(makeChain(null));
        await expect(
            controller.authorizeToServer(req, '0123456789abcdef0123456789abcdef', { serverId: SERVER_ID }),
        ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when bot lacks joinServers permission', async () => {
        (Bot.findOne as jest.Mock).mockReturnValue(
            makeChain({
                clientId: '0123456789abcdef0123456789abcdef',
                userId: new Types.ObjectId(BOT_USER_ID),
                ownerId: new Types.ObjectId(OWNER_ID),
                botPermissions: { joinServers: false },
            }),
        );
        await expect(
            controller.authorizeToServer(req, '0123456789abcdef0123456789abcdef', { serverId: SERVER_ID }),
        ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when server does not exist', async () => {
        (Bot.findOne as jest.Mock).mockReturnValue(
            makeChain({
                clientId: '0123456789abcdef0123456789abcdef',
                userId: new Types.ObjectId(BOT_USER_ID),
                botPermissions: { joinServers: true },
            }),
        );
        (Server.findById as jest.Mock).mockReturnValue(makeChain(null));

        await expect(
            controller.authorizeToServer(req, '0123456789abcdef0123456789abcdef', { serverId: SERVER_ID }),
        ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when caller is not a server member', async () => {
        const otherOwnerId = new Types.ObjectId().toHexString();
        const callerReq = { user: { id: OWNER_ID } } as never;

        (Bot.findOne as jest.Mock).mockReturnValue(
            makeChain({
                clientId: '0123456789abcdef0123456789abcdef',
                userId: new Types.ObjectId(BOT_USER_ID),
                botPermissions: { joinServers: true },
            }),
        );
        (Server.findById as jest.Mock).mockReturnValue(
            makeChain({
                _id: new Types.ObjectId(SERVER_ID),
                name: 'Test Server',
                ownerId: new Types.ObjectId(otherOwnerId),
                deletedAt: undefined,
            }),
        );
        (ServerMember.findOne as jest.Mock).mockReturnValue(makeChain(null));

        await expect(
            controller.authorizeToServer(callerReq, '0123456789abcdef0123456789abcdef', { serverId: SERVER_ID }),
        ).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException when bot is already in the server', async () => {
        (Bot.findOne as jest.Mock).mockReturnValue(
            makeChain({
                clientId: '0123456789abcdef0123456789abcdef',
                userId: new Types.ObjectId(BOT_USER_ID),
                botPermissions: { joinServers: true },
            }),
        );
        (Server.findById as jest.Mock).mockReturnValue(
            makeChain({
                _id: new Types.ObjectId(SERVER_ID),
                name: 'Test Server',
                ownerId: new Types.ObjectId(OWNER_ID),
                deletedAt: undefined,
            }),
        );
        (ServerMember.findOne as jest.Mock).mockReturnValue(
            makeChain({ _id: new Types.ObjectId() }),
        );

        await expect(
            controller.authorizeToServer(req, '0123456789abcdef0123456789abcdef', { serverId: SERVER_ID }),
        ).rejects.toThrow(ConflictException);
    });

    it('throws ForbiddenException when bot is banned from the server', async () => {
        (Bot.findOne as jest.Mock).mockReturnValue(
            makeChain({
                clientId: '0123456789abcdef0123456789abcdef',
                userId: new Types.ObjectId(BOT_USER_ID),
                botPermissions: { joinServers: true },
            }),
        );
        (Server.findById as jest.Mock).mockReturnValue(
            makeChain({
                _id: new Types.ObjectId(SERVER_ID),
                name: 'Test Server',
                ownerId: new Types.ObjectId(OWNER_ID),
                deletedAt: undefined,
            }),
        );
        (ServerMember.findOne as jest.Mock).mockReturnValue(makeChain(null));
        (ServerBan.findOne as jest.Mock).mockReturnValue(
            makeChain({ _id: new Types.ObjectId() }),
        );

        await expect(
            controller.authorizeToServer(req, '0123456789abcdef0123456789abcdef', { serverId: SERVER_ID }),
        ).rejects.toThrow(ForbiddenException);
    });

    it('adds bot to server and broadcasts member_added event on success', async () => {
        (Bot.findOne as jest.Mock).mockReturnValue(
            makeChain({
                clientId: '0123456789abcdef0123456789abcdef',
                userId: new Types.ObjectId(BOT_USER_ID),
                botPermissions: { joinServers: true },
            }),
        );
        (Server.findById as jest.Mock).mockReturnValue(
            makeChain({
                _id: new Types.ObjectId(SERVER_ID),
                name: 'Test Server',
                ownerId: new Types.ObjectId(OWNER_ID),
                deletedAt: undefined,
                defaultRoleId: undefined,
            }),
        );
        (ServerMember.findOne as jest.Mock).mockReturnValue(makeChain(null));
        (ServerBan.findOne as jest.Mock).mockReturnValue(makeChain(null));
        (Role.findOne as jest.Mock).mockReturnValue(makeChain(null));
        (User.findById as jest.Mock).mockReturnValue({ lean: () => ({ username: 'testbot' }) });
        mockRoleRepo.findMaxPositionByServerId.mockResolvedValue({ position: 1 });
        mockRoleRepo.create.mockResolvedValue({ _id: new Types.ObjectId(), name: 'testbot', managed: true });
        (ServerMember.create as jest.Mock).mockResolvedValue({});

        const result = await controller.authorizeToServer(req, '0123456789abcdef0123456789abcdef', {
            serverId: SERVER_ID,
        });

        expect(result).toEqual({ serverId: SERVER_ID, serverName: 'Test Server' });
        expect(ServerMember.create).toHaveBeenCalledWith(
            expect.objectContaining({
                serverId: expect.any(Types.ObjectId),
                userId: expect.any(Types.ObjectId),
            }),
        );
        expect(mockWsServer.broadcastToServer).toHaveBeenCalledWith(
            SERVER_ID,
            expect.objectContaining({ type: 'member_added' }),
        );
    });
});

describe('getBotServers', () => {
    const req = { user: { id: OWNER_ID } } as never;

    it('throws ForbiddenException for non-owner/non-self access', async () => {
        const otherUserId = new Types.ObjectId().toHexString();
        (Bot.findOne as jest.Mock).mockReturnValue(
            makeChain({
                _id: new Types.ObjectId(),
                clientId: '0123456789abcdef0123456789abcdef',
                ownerId: new Types.ObjectId(otherUserId),
                userId: new Types.ObjectId(BOT_USER_ID),
            }),
        );

        await expect(controller.getBotServers(req, '0123456789abcdef0123456789abcdef')).rejects.toThrow(
            ForbiddenException,
        );
    });

    it('returns mapped server list for owner', async () => {
        (Bot.findOne as jest.Mock).mockReturnValue(
            makeChain({
                _id: new Types.ObjectId(),
                clientId: '0123456789abcdef0123456789abcdef',
                ownerId: new Types.ObjectId(OWNER_ID),
                userId: new Types.ObjectId(BOT_USER_ID),
            }),
        );
        (ServerMember.countDocuments as jest.Mock).mockResolvedValue(5);

        const result = await controller.getBotServers(req, '0123456789abcdef0123456789abcdef');
        expect(result).toEqual({ count: 5 });
    });
});
