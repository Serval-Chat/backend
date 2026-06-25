import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { generateSnowflakeId } from '@/utils/snowflake';

jest.mock('@/models/Bot', () => ({
    BOT_PERMISSION_KEYS: [
        'readMessages',
        'sendMessages',
        'manageMessages',
        'readUsers',
        'joinServers',
        'manageServer',
        'manageChannels',
        'manageMembers',
        'readReactions',
        'addReactions',
        'viewChannels',
        'connect',
        'deleteMessagesOfOthers',
        'manageRoles',
        'banMembers',
        'kickMembers',
        'manageInvites',
        'administrator',
        'manageWebhooks',
        'pingRolesAndEveryone',
        'manageReactions',
        'exportChannelMessages',
        'bypassSlowmode',
        'pinMessages',
        'seeDeletedMessages',
        'moderateMembers',
        'manageStickers',
    ],
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
        viewChannels: false,
        connect: false,
        deleteMessagesOfOthers: false,
        manageRoles: false,
        banMembers: false,
        kickMembers: false,
        manageInvites: false,
        administrator: false,
        manageWebhooks: false,
        pingRolesAndEveryone: false,
        manageReactions: false,
        exportChannelMessages: false,
        bypassSlowmode: false,
        pinMessages: false,
        seeDeletedMessages: false,
        moderateMembers: false,
        manageStickers: false,
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
    Server: { findById: jest.fn(), findOne: jest.fn() },
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

const OWNER_ID = new Types.ObjectId().toHexString();
const BOT_USER_ID = new Types.ObjectId().toHexString();
const SERVER_ID = generateSnowflakeId();

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
    updateDecoration: jest.fn(),
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
        await expect(
            controller.getPublicInfo('0123456789abcdef0123456789abcdef'),
        ).rejects.toThrow(NotFoundException);
    });

    it('returns public bot info including server count', async () => {
        const botUserOid = new Types.ObjectId();
        (Bot.findOne as jest.Mock).mockReturnValue(
            makeChain({
                clientId: '0123456789abcdef0123456789abcdef',
                botPermissions: { readMessages: true, sendMessages: false },
                userId: botUserOid.toHexString(),
                userIdUser: {
                    snowflakeId: botUserOid.toHexString(),
                    username: 'mybot',
                    displayName: 'My Bot',
                    bio: 'A bot',
                    profilePicture: undefined,
                },
            }),
        );
        (ServerMember.countDocuments as jest.Mock).mockResolvedValue(7);

        const result = await controller.getPublicInfo(
            '0123456789abcdef0123456789abcdef',
        );

        expect(result.clientId).toBe('0123456789abcdef0123456789abcdef');
        expect(result.username).toBe('mybot');
        expect(result.displayName).toBe('My Bot');
        expect(result.serverCount).toBe(7);
    });
});

describe('authorizeToServer', () => {
    const req = { user: { id: OWNER_ID } } as never;

    it('throws BadRequestException for invalid serverId', async () => {
        await expect(
            controller.authorizeToServer(
                req,
                '0123456789abcdef0123456789abcdef',
                {
                    serverId: 'not-an-objectid',
                },
            ),
        ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when bot does not exist', async () => {
        (Bot.findOne as jest.Mock).mockReturnValue(makeChain(null));
        await expect(
            controller.authorizeToServer(
                req,
                '0123456789abcdef0123456789abcdef',
                { serverId: SERVER_ID },
            ),
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
            controller.authorizeToServer(
                req,
                '0123456789abcdef0123456789abcdef',
                { serverId: SERVER_ID },
            ),
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
        (Server.findOne as jest.Mock).mockReturnValue(makeChain(null));

        await expect(
            controller.authorizeToServer(
                req,
                '0123456789abcdef0123456789abcdef',
                { serverId: SERVER_ID },
            ),
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
        (Server.findOne as jest.Mock).mockReturnValue(
            makeChain({
                _id: new Types.ObjectId(),
                name: 'Test Server',
                ownerId: new Types.ObjectId(otherOwnerId),
                deletedAt: undefined,
            }),
        );
        (ServerMember.findOne as jest.Mock).mockReturnValue(makeChain(null));

        await expect(
            controller.authorizeToServer(
                callerReq,
                '0123456789abcdef0123456789abcdef',
                { serverId: SERVER_ID },
            ),
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
        (Server.findOne as jest.Mock).mockReturnValue(
            makeChain({
                _id: new Types.ObjectId(),
                name: 'Test Server',
                ownerId: new Types.ObjectId(OWNER_ID),
                deletedAt: undefined,
            }),
        );
        (ServerMember.findOne as jest.Mock).mockReturnValue(
            makeChain({ _id: new Types.ObjectId() }),
        );

        await expect(
            controller.authorizeToServer(
                req,
                '0123456789abcdef0123456789abcdef',
                { serverId: SERVER_ID },
            ),
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
        (Server.findOne as jest.Mock).mockReturnValue(
            makeChain({
                _id: new Types.ObjectId(),
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
            controller.authorizeToServer(
                req,
                '0123456789abcdef0123456789abcdef',
                { serverId: SERVER_ID },
            ),
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
        (Server.findOne as jest.Mock).mockReturnValue(
            makeChain({
                _id: new Types.ObjectId(),
                name: 'Test Server',
                ownerId: new Types.ObjectId(OWNER_ID),
                deletedAt: undefined,
                defaultRoleId: undefined,
            }),
        );
        (ServerMember.findOne as jest.Mock).mockReturnValue(makeChain(null));
        (ServerBan.findOne as jest.Mock).mockReturnValue(makeChain(null));
        (Role.findOne as jest.Mock).mockReturnValue(makeChain(null));
        (User.findOne as jest.Mock).mockReturnValue({
            lean: () => ({ username: 'testbot' }),
        });
        mockRoleRepo.findMaxPositionByServerId.mockResolvedValue({
            position: 1,
        });
        mockRoleRepo.create.mockResolvedValue({
            _id: new Types.ObjectId(),
            name: 'testbot',
            managed: true,
        });
        (ServerMember.create as jest.Mock).mockResolvedValue({});

        const result = await controller.authorizeToServer(
            req,
            '0123456789abcdef0123456789abcdef',
            {
                serverId: SERVER_ID,
            },
        );

        expect(result).toEqual({
            serverId: SERVER_ID,
            serverName: 'Test Server',
        });
        expect(ServerMember.create).toHaveBeenCalledWith(
            expect.objectContaining({
                serverId: expect.any(String),
                userId: expect.any(String),
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

        await expect(
            controller.getBotServers(req, '0123456789abcdef0123456789abcdef'),
        ).rejects.toThrow(ForbiddenException);
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

        const result = await controller.getBotServers(
            req,
            '0123456789abcdef0123456789abcdef',
        );
        expect(result).toEqual({ count: 5 });
    });
});
