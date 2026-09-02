/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import { ServerController } from '../ServerController';
import type { IWsUser } from '@/ws/types';

jest.mock('@/services/PushService', () => ({
    notifyUser: jest.fn().mockResolvedValue(undefined),
    notifyUsers: jest.fn().mockResolvedValue(undefined),
}));

const SERVER = '0254710804526399488';
const FOREIGN_SERVER = '0254710804526399499';
const CHANNEL = '0254710804526399489';
const USER = '0254710804526399490';
const OWN_EMOJI = '1111111111111111111';
const FOREIGN_EMOJI = '2222222222222222222';
const FOREIGN_STICKER = '3333333333333333333';

function makeWsUser(overrides: Partial<IWsUser> = {}): IWsUser {
    return {
        userId: USER,
        username: 'testuser',
        isBot: false,
        ...overrides,
    } as IWsUser;
}

function buildController(options?: {
    emojiServerId?: string;
    stickerServerId?: string;
    allowExternal?: boolean;
}) {
    const messageRepo = {
        create: jest.fn().mockImplementation(async (data) => ({
            ...data,
            _id: new Types.ObjectId(),
            snowflakeId: new Types.ObjectId().toString(),
            createdAt: new Date(),
        })),
        findById: jest.fn().mockResolvedValue({
            _id: new Types.ObjectId(),
            snowflakeId: new Types.ObjectId().toString(),
            serverId: SERVER,
            channelId: CHANNEL,
            senderId: USER,
            text: 'original text',
        }),
        updateMessage: jest.fn().mockImplementation(async (id, data) => ({
            _id: new Types.ObjectId(),
            snowflakeId: id,
            serverId: SERVER,
            channelId: CHANNEL,
            senderId: USER,
            ...data,
        })),
    };
    const serverMemberRepo = {
        findByServerAndUser: jest.fn().mockResolvedValue({ userId: USER }),
        findByServerId: jest.fn().mockResolvedValue([]),
    };
    const serverRepo = {
        findById: jest.fn().mockResolvedValue({ ownerId: 'someone-else' }),
    };
    const channelRepo = {
        findById: jest.fn().mockResolvedValue({ type: 'text', slowMode: 0 }),
        updateLastMessageAt: jest.fn().mockResolvedValue(undefined),
    };
    const serverChannelReadRepo = {
        upsert: jest.fn().mockResolvedValue(undefined),
    };
    const permissionService = {
        hasChannelPermission: jest
            .fn()
            .mockImplementation(async (_s, _u, _c, perm: string) => {
                if (perm === 'useExternalEmojisAndStickers') {
                    return options?.allowExternal ?? false;
                }
                return true;
            }),
        hasPermission: jest.fn().mockResolvedValue(true),
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
    const emojiRepo = {
        findById: jest
            .fn()
            .mockResolvedValue(
                options?.emojiServerId !== undefined
                    ? { serverId: options.emojiServerId }
                    : null,
            ),
    };
    const stickerRepo = {
        findById: jest
            .fn()
            .mockResolvedValue(
                options?.stickerServerId !== undefined
                    ? { serverId: options.stickerServerId }
                    : null,
            ),
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
        serverRepo as any,
        { findById: jest.fn() } as any, // userRepo
        messageRepo as any,
        serverMemberRepo as any,
        channelRepo as any,
        serverChannelReadRepo as any,
        {} as any, // roleRepo
        emojiRepo as any,
        stickerRepo as any,
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

describe('ServerController external emoji/sticker permission (send_message_server)', () => {
    it('allows a message with only own-server emojis regardless of the permission', async () => {
        const { controller, messageRepo } = buildController({
            emojiServerId: SERVER,
            allowExternal: false,
        });

        await expect(
            controller.onSendMessageServer(
                {
                    serverId: SERVER,
                    channelId: CHANNEL,
                    text: `hi <emoji:${OWN_EMOJI}>`,
                },
                makeWsUser(),
            ),
        ).resolves.toBeDefined();
        expect(messageRepo.create).toHaveBeenCalled();
    });

    it('rejects a foreign-server emoji when the permission is denied', async () => {
        const { controller, messageRepo } = buildController({
            emojiServerId: FOREIGN_SERVER,
            allowExternal: false,
        });

        await expect(
            controller.onSendMessageServer(
                {
                    serverId: SERVER,
                    channelId: CHANNEL,
                    text: `hi <emoji:${FOREIGN_EMOJI}>`,
                },
                makeWsUser(),
            ),
        ).rejects.toThrow();
        expect(messageRepo.create).not.toHaveBeenCalled();
    });

    it('allows a foreign-server emoji when the permission is granted', async () => {
        const { controller, messageRepo } = buildController({
            emojiServerId: FOREIGN_SERVER,
            allowExternal: true,
        });

        await expect(
            controller.onSendMessageServer(
                {
                    serverId: SERVER,
                    channelId: CHANNEL,
                    text: `hi <emoji:${FOREIGN_EMOJI}>`,
                },
                makeWsUser(),
            ),
        ).resolves.toBeDefined();
        expect(messageRepo.create).toHaveBeenCalled();
    });

    it('rejects a foreign-server stickerId when the permission is denied', async () => {
        const { controller, messageRepo } = buildController({
            stickerServerId: FOREIGN_SERVER,
            allowExternal: false,
        });

        await expect(
            controller.onSendMessageServer(
                {
                    serverId: SERVER,
                    channelId: CHANNEL,
                    text: 'hi',
                    stickerId: FOREIGN_STICKER,
                },
                makeWsUser(),
            ),
        ).rejects.toThrow();
        expect(messageRepo.create).not.toHaveBeenCalled();
    });
});

describe('ServerController external emoji/sticker permission (edit_message_server)', () => {
    it('rejects editing text in a foreign-server emoji when the permission is denied', async () => {
        const { controller, messageRepo } = buildController({
            emojiServerId: FOREIGN_SERVER,
            allowExternal: false,
        });

        await expect(
            controller.onEditMessageServer(
                {
                    messageId: '0254710804526399491',
                    text: `edited <emoji:${FOREIGN_EMOJI}>`,
                },
                makeWsUser(),
            ),
        ).rejects.toThrow();
        expect(messageRepo.updateMessage).not.toHaveBeenCalled();
    });

    it('allows editing text with only own-server emojis', async () => {
        const { controller, messageRepo } = buildController({
            emojiServerId: SERVER,
            allowExternal: false,
        });

        await expect(
            controller.onEditMessageServer(
                {
                    messageId: '0254710804526399491',
                    text: `edited <emoji:${OWN_EMOJI}>`,
                },
                makeWsUser(),
            ),
        ).resolves.toBeDefined();
        expect(messageRepo.updateMessage).toHaveBeenCalled();
    });
});
