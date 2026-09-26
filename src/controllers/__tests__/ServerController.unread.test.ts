import { ServerController } from '../ServerController';

const SERVER = '0336236036713611264';
const USER = '0244871598790672384';
const CATEGORY = '0336245712461234176';
const TEXT_CHANNEL = '0336236036789108736';
const LINK_CHANNEL = '0336244996082499584';
const HIDDEN_CHANNEL = '0336245897346154496';

const readTextChannel = {
    channelId: TEXT_CHANNEL,
    lastReadAt: new Date('2026-09-26T17:23:52.986Z'),
};

const buildController = (): {
    controller: ServerController;
    channelRepo: { findByServerIds: jest.Mock };
    serverChannelReadRepo: { findByUserId: jest.Mock };
    permissionService: {
        hasChannelPermissions: jest.Mock;
        hasCategoryPermissions: jest.Mock;
    };
} => {
    const serverMemberRepo = {
        findByUserId: jest.fn().mockResolvedValue([{ serverId: SERVER }]),
    };
    const channelRepo = {
        findByServerIds: jest.fn().mockResolvedValue([]),
    };
    const serverChannelReadRepo = {
        findByUserId: jest.fn().mockResolvedValue([readTextChannel]),
    };
    const pingService = {
        getPingsForUser: jest.fn().mockResolvedValue([]),
    };
    const permissionService = {
        hasChannelPermissions: jest
            .fn()
            .mockResolvedValue(new Map<string, boolean>()),
        hasCategoryPermissions: jest
            .fn()
            .mockResolvedValue(new Map<string, boolean>()),
    };

    const controller = new ServerController(
        {} as never,
        serverMemberRepo as never,
        channelRepo as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        serverChannelReadRepo as never,
        permissionService as never,
        {} as never,
        pingService as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
    );

    return {
        controller,
        channelRepo,
        serverChannelReadRepo,
        permissionService,
    };
};

describe('GET /servers/unread hasUnread computation', () => {
    it('reports no unread when the only unread channel is hidden by its category', async () => {
        const { controller, channelRepo, permissionService } =
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

        const status = await controller.getUnreadStatus(USER);

        expect(status[SERVER]?.hasUnread).toBe(false);
    });

    it('never counts link channels as unread', async () => {
        const { controller, channelRepo, permissionService } =
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

        const status = await controller.getUnreadStatus(USER);

        expect(status[SERVER]?.hasUnread).toBe(false);
    });

    it('reports unread when a visible channel has a newer message', async () => {
        const { controller, channelRepo, permissionService } =
            buildController();
        channelRepo.findByServerIds.mockResolvedValue([
            {
                snowflakeId: TEXT_CHANNEL,
                serverId: SERVER,
                type: 'text',
                categoryId: null,
                lastMessageAt: new Date('2026-09-26T18:00:00.000Z'),
            },
        ]);
        permissionService.hasChannelPermissions.mockResolvedValue(
            new Map([[TEXT_CHANNEL, true]]),
        );
        permissionService.hasCategoryPermissions.mockResolvedValue(new Map());

        const status = await controller.getUnreadStatus(USER);

        expect(status[SERVER]?.hasUnread).toBe(true);
    });

    it('reports read when every visible channel has a fresh read record', async () => {
        const { controller, channelRepo, permissionService } =
            buildController();
        channelRepo.findByServerIds.mockResolvedValue([
            {
                snowflakeId: TEXT_CHANNEL,
                serverId: SERVER,
                type: 'text',
                categoryId: null,
                lastMessageAt: new Date('2026-08-01T18:15:36.248Z'),
            },
        ]);
        permissionService.hasChannelPermissions.mockResolvedValue(
            new Map([[TEXT_CHANNEL, true]]),
        );
        permissionService.hasCategoryPermissions.mockResolvedValue(new Map());

        const status = await controller.getUnreadStatus(USER);

        expect(status[SERVER]).toEqual({ hasUnread: false, pingCount: 0 });
    });
});
