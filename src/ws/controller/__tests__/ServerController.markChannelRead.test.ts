/* eslint-disable @typescript-eslint/no-explicit-any */
import { ServerController } from '../ServerController';
import type { IWsUser } from '@/ws/types';

jest.mock('@/services/PushService', () => ({
    notifyUser: jest.fn().mockResolvedValue(undefined),
    notifyUsers: jest.fn().mockResolvedValue(undefined),
}));

const SERVER = '0336236036713611264';
const USER = '0244871598790672384';
const CATEGORY = '0336245712461234176';
const TEXT_CHANNEL = '0336236036789108736';
const LINK_CHANNEL = '0336244996082499584';
const HIDDEN_CHANNEL = '0336245897346154496';
const UNREAD_CHANNEL = '0336237807192244224';

const user: IWsUser = {
    userId: USER,
    username: 'cat',
    isBot: false,
} as IWsUser;

const TEXT_READ = {
    channelId: TEXT_CHANNEL,
    lastReadAt: new Date('2026-09-26T17:23:52.986Z'),
};

const buildController = (): {
    controller: ServerController;
    channelRepo: { findByServerIds: jest.Mock };
    permissionService: {
        hasChannelPermissions: jest.Mock;
        hasCategoryPermissions: jest.Mock;
    };
    wsServer: { broadcastToUser: jest.Mock };
} => {
    const channelRepo = { findByServerIds: jest.fn().mockResolvedValue([]) };
    const serverChannelReadRepo = {
        upsert: jest.fn().mockResolvedValue({
            lastReadAt: new Date('2026-09-26T17:23:52Z'),
        }),
        findByUserId: jest.fn().mockResolvedValue([TEXT_READ]),
    };
    const permissionService = {
        hasChannelPermissions: jest
            .fn()
            .mockResolvedValue(new Map<string, boolean>()),
        hasCategoryPermissions: jest
            .fn()
            .mockResolvedValue(new Map<string, boolean>()),
        hasChannelPermission: jest.fn().mockResolvedValue(true),
    };
    const serverMemberRepo = {
        findByServerAndUser: jest
            .fn()
            .mockResolvedValue({ userId: USER, serverId: SERVER }),
        findByServerId: jest.fn().mockResolvedValue([]),
    };
    const redisService = {
        getClient: jest.fn().mockReturnValue({
            setex: jest.fn().mockResolvedValue('OK'),
        }),
    };
    const wsServer = { broadcastToUser: jest.fn() };

    const controller = new ServerController(
        {} as any,
        { findById: jest.fn() } as any,
        {} as any,
        serverMemberRepo as any,
        channelRepo as any,
        serverChannelReadRepo as any,
        {} as any,
        { findById: jest.fn().mockResolvedValue(null) } as any,
        { findById: jest.fn().mockResolvedValue(null) } as any,
        permissionService as any,
        {} as any,
        {} as any,
        {} as any,
        redisService as any,
        {} as any,
        {} as any,
        { createAndBroadcast: jest.fn().mockResolvedValue({}) },
    );
    (controller as any).wsServer = wsServer;

    return { controller, channelRepo, permissionService, wsServer };
};

const emittedHasUnread = (wsServer: {
    broadcastToUser: jest.Mock;
}): boolean | undefined => {
    const call = wsServer.broadcastToUser.mock.calls.find(
        (args: unknown[]): boolean =>
            (args[1] as { type?: string }).type === 'server_unread_updated',
    );
    return (call?.[1] as { payload?: { hasUnread?: boolean } } | undefined)
        ?.payload?.hasUnread;
};

describe('mark_channel_read server unread recompute', () => {
    it('reports no unread when only a link channel with messages lacks a read record', async () => {
        const { controller, channelRepo, permissionService, wsServer } =
            buildController();
        channelRepo.findByServerIds.mockResolvedValue([
            {
                snowflakeId: TEXT_CHANNEL,
                serverId: SERVER,
                type: 'text',
                categoryId: null,
                lastMessageAt: new Date('2026-08-01T18:15:36.248Z'),
            },
            {
                snowflakeId: LINK_CHANNEL,
                serverId: SERVER,
                type: 'link',
                categoryId: null,
                lastMessageAt: new Date('2026-07-16T20:37:34.196Z'),
            },
        ]);
        permissionService.hasChannelPermissions.mockResolvedValue(
            new Map([
                [TEXT_CHANNEL, true],
                [LINK_CHANNEL, true],
            ]),
        );
        permissionService.hasCategoryPermissions.mockResolvedValue(new Map());

        await controller.onMarkChannelRead(
            { serverId: SERVER, channelId: TEXT_CHANNEL },
            user,
        );

        expect(emittedHasUnread(wsServer)).toBe(false);
    });

    it('reports no unread when the only unread channel is hidden by its category', async () => {
        const { controller, channelRepo, permissionService, wsServer } =
            buildController();
        channelRepo.findByServerIds.mockResolvedValue([
            {
                snowflakeId: TEXT_CHANNEL,
                serverId: SERVER,
                type: 'text',
                categoryId: null,
                lastMessageAt: new Date('2026-08-01T18:15:36.248Z'),
            },
            {
                snowflakeId: HIDDEN_CHANNEL,
                serverId: SERVER,
                type: 'text',
                categoryId: CATEGORY,
                lastMessageAt: new Date('2026-08-01T12:26:28.855Z'),
            },
        ]);
        permissionService.hasChannelPermissions.mockResolvedValue(
            new Map([
                [TEXT_CHANNEL, true],
                [HIDDEN_CHANNEL, true],
            ]),
        );
        permissionService.hasCategoryPermissions.mockResolvedValue(
            new Map([[CATEGORY, false]]),
        );

        await controller.onMarkChannelRead(
            { serverId: SERVER, channelId: TEXT_CHANNEL },
            user,
        );

        expect(emittedHasUnread(wsServer)).toBe(false);
    });

    it('still reports unread when a visible channel has a newer message', async () => {
        const { controller, channelRepo, permissionService, wsServer } =
            buildController();
        channelRepo.findByServerIds.mockResolvedValue([
            {
                snowflakeId: TEXT_CHANNEL,
                serverId: SERVER,
                type: 'text',
                categoryId: null,
                lastMessageAt: new Date('2026-08-01T18:15:36.248Z'),
            },
            {
                snowflakeId: UNREAD_CHANNEL,
                serverId: SERVER,
                type: 'text',
                categoryId: null,
                lastMessageAt: new Date('2026-09-26T18:00:00.000Z'),
            },
        ]);
        permissionService.hasChannelPermissions.mockResolvedValue(
            new Map([
                [TEXT_CHANNEL, true],
                [UNREAD_CHANNEL, true],
            ]),
        );
        permissionService.hasCategoryPermissions.mockResolvedValue(new Map());

        await controller.onMarkChannelRead(
            { serverId: SERVER, channelId: TEXT_CHANNEL },
            user,
        );

        expect(emittedHasUnread(wsServer)).toBe(true);
    });
});
