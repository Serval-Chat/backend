/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import { ServerController } from '../ServerController';
import type { IWsUser } from '@/ws/types';

jest.mock('@/services/PushService', () => ({
    notifyUser: jest.fn().mockResolvedValue(undefined),
    notifyUsers: jest.fn().mockResolvedValue(undefined),
}));

const SERVER = '0254710804526399488';
const CHANNEL = '0254710804526399489';
const USER = '0254710804526399490';

function makeWsUser(overrides: Partial<IWsUser> = {}): IWsUser {
    return {
        userId: USER,
        username: 'testuser',
        isBot: false,
        ...overrides,
    } as IWsUser;
}

function buildController() {
    const messageRepo = {
        create: jest.fn().mockImplementation(async (data) => ({
            ...data,
            _id: new Types.ObjectId(),
            snowflakeId: new Types.ObjectId().toString(),
            createdAt: new Date(),
        })),
    };
    const serverMemberRepo = {
        findByServerAndUser: jest.fn().mockResolvedValue({ userId: USER }),
        findByServerId: jest.fn().mockResolvedValue([]),
    };
    const channelRepo = {
        findById: jest.fn().mockResolvedValue({ type: 'text', slowMode: 0 }),
        updateLastMessageAt: jest.fn().mockResolvedValue(undefined),
    };
    const serverChannelReadRepo = {
        upsert: jest.fn().mockResolvedValue(undefined),
    };
    const permissionService = {
        hasChannelPermission: jest.fn().mockResolvedValue(true),
        hasPermission: jest.fn().mockResolvedValue(true),
    };
    const muteRepo = {
        findActiveByUserId: jest.fn().mockResolvedValue(null),
        checkExpired: jest.fn().mockResolvedValue(undefined),
    };
    const transactionManager = {
        runInTransaction: jest.fn().mockImplementation((fn) => fn(null)),
    };
    const redisService = {
        getClient: jest.fn().mockReturnValue({
            setex: jest.fn().mockResolvedValue('OK'),
        }),
    };
    const embedService = {
        processServerMessage: jest.fn().mockResolvedValue(undefined),
    };
    const warningRepo = {
        hasUnacknowledged: jest.fn().mockResolvedValue(false),
    };
    const wsServer = {
        broadcastToChannel: jest.fn(),
        broadcastToServerWithPermission: jest.fn().mockResolvedValue(undefined),
        broadcastToUser: jest.fn(),
    };

    const controller = new ServerController(
        {} as any, // serverRepo
        { findById: jest.fn() } as any, // userRepo
        messageRepo as any,
        serverMemberRepo as any,
        channelRepo as any,
        serverChannelReadRepo as any,
        {} as any, // roleRepo
        { findById: jest.fn().mockResolvedValue(null) } as any, // emojiRepo
        { findById: jest.fn().mockResolvedValue(null) } as any, // stickerRepo
        permissionService as any,
        {} as any, // pingService
        muteRepo as any,
        transactionManager,
        redisService as any,
        embedService as any,
        warningRepo as any,
        { createAndBroadcast: jest.fn().mockResolvedValue({}) }, // ServerAuditLogService
    );
    (controller as any).wsServer = wsServer;

    return { controller, messageRepo };
}

describe('ServerController wires noEmbedsUrls through to the persisted message', () => {
    it('passes noEmbedsUrls from the payload to messageRepo.create', async () => {
        const { controller, messageRepo } = buildController();

        await controller.onSendMessageServer(
            {
                serverId: SERVER,
                channelId: CHANNEL,
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
        const { controller, messageRepo } = buildController();

        await controller.onSendMessageServer(
            { serverId: SERVER, channelId: CHANNEL, text: 'hello' },
            makeWsUser(),
        );

        expect(messageRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({ noEmbedsUrls: undefined }),
            null,
        );
    });
});
