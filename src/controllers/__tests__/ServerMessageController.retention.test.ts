import { ServerMessageController } from '../ServerMessageController';

const SERVER_ID = '1234567890123456789';
const CHANNEL_ID = '2234567890123456789';
const USER_ID = '3234567890123456789';
const MESSAGE_ID = '4234567890123456789';

const createController = (canSeeDeletedMessages: boolean) => {
    const messageRepo = {
        findByChannelId: jest.fn().mockResolvedValue([]),
        findPinnedByChannelId: jest.fn().mockResolvedValue([]),
        findById: jest.fn().mockResolvedValue({
            snowflakeId: MESSAGE_ID,
            channelId: CHANNEL_ID,
            senderId: USER_ID,
            text: 'message text',
        }),
    };
    const serverRepo = {
        findById: jest.fn().mockResolvedValue({
            deletedMessageRetentionMinutes: 30,
        }),
    };
    const permissionService = {
        hasChannelPermission: jest.fn(
            async (
                _serverId: string,
                _userId: string,
                _channelId: string,
                permission: string,
            ) =>
                permission === 'viewChannels' ||
                (permission === 'seeDeletedMessages' && canSeeDeletedMessages),
        ),
        requireChannelPermission: jest.fn().mockResolvedValue(undefined),
    };
    const redisService = {
        getClient: jest.fn().mockReturnValue({
            pipeline: jest.fn().mockReturnValue({
                set: jest.fn(),
                exec: jest.fn().mockResolvedValue([]),
            }),
        }),
    };
    const controller = new ServerMessageController(
        messageRepo as never,
        {
            findByServerAndUser: jest
                .fn()
                .mockResolvedValue({ userId: USER_ID }),
        } as never,
        {
            findById: jest.fn().mockResolvedValue({
                serverId: SERVER_ID,
                type: 'text',
            }),
        } as never,
        {
            getReactionsForMessages: jest.fn().mockResolvedValue({}),
            getReactionsByMessage: jest.fn().mockResolvedValue([]),
        } as never,
        {} as never,
        {} as never,
        permissionService as never,
        { error: jest.fn() } as never,
        {} as never,
        {} as never,
        {} as never,
        serverRepo as never,
        {} as never,
        redisService as never,
        {} as never,
    );

    return { controller, messageRepo, serverRepo };
};

describe('ServerMessageController deleted message retention', () => {
    const now = new Date('2026-11-02T12:00:00.000Z');
    const cutoff = new Date(now.getTime() - 30 * 60_000);

    beforeEach(() => {
        jest.useFakeTimers().setSystemTime(now);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('passes the configured cutoff to privileged history reads', async () => {
        const { controller, messageRepo, serverRepo } = createController(true);

        await controller.getMessages(SERVER_ID, CHANNEL_ID, USER_ID);

        expect(serverRepo.findById).toHaveBeenCalledWith(SERVER_ID);
        expect(messageRepo.findByChannelId).toHaveBeenCalledWith(
            CHANNEL_ID,
            50,
            undefined,
            undefined,
            undefined,
            true,
            cutoff,
        );
    });

    it('passes the configured cutoff to privileged pin reads', async () => {
        const { controller, messageRepo } = createController(true);

        await controller.getPinnedMessages(SERVER_ID, CHANNEL_ID, USER_ID);

        expect(messageRepo.findPinnedByChannelId).toHaveBeenCalledWith(
            CHANNEL_ID,
            true,
            cutoff,
        );
    });

    it('passes the configured cutoff to privileged message and reply lookups', async () => {
        const { controller, messageRepo } = createController(true);

        await controller.getMessage(SERVER_ID, CHANNEL_ID, MESSAGE_ID, USER_ID);

        expect(messageRepo.findById).toHaveBeenCalledWith(
            MESSAGE_ID,
            true,
            cutoff,
        );
    });

    it('does not request deleted-message visibility for other members', async () => {
        const { controller, messageRepo, serverRepo } = createController(false);

        await controller.getMessages(SERVER_ID, CHANNEL_ID, USER_ID);

        expect(serverRepo.findById).not.toHaveBeenCalled();
        expect(messageRepo.findByChannelId).toHaveBeenCalledWith(
            CHANNEL_ID,
            50,
            undefined,
            undefined,
            undefined,
            false,
            undefined,
        );
    });
});
