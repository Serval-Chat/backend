/* eslint-disable @typescript-eslint/no-explicit-any */
import { ServerController } from '@/ws/controller/ServerController';
import { Types } from 'mongoose';

jest.mock('@/services/PushService', () => ({
    notifyUser: jest.fn().mockResolvedValue(undefined),
    notifyUsers: jest.fn().mockResolvedValue(undefined),
}));

const hex = () => new Types.ObjectId().toHexString();

const SERVER_ID = hex();
const CHANNEL_ID = hex();
const SENDER_ID = hex();
const VISIBLE_USER_ID = hex();
const HIDDEN_USER_ID = hex();
const ROLE_ID = hex();
const MESSAGE_ID = hex();

type HandleMentions = (
    serverId: string,
    channelId: string,
    senderId: string,
    senderUsername: string,
    mentionedUserIds: string[],
    mentionedRoleIds: string[],
    mentionedEveryone: boolean,
    message: any,
) => Promise<void>;

describe('Server WS mention visibility', () => {
    let controller: ServerController;
    let handleMentions: HandleMentions;
    let userRepo: { findById: jest.Mock };
    let serverMemberRepo: {
        findByServerAndUser: jest.Mock;
        findByServerId: jest.Mock;
    };
    let channelRepo: { findById: jest.Mock; updateLastMessageAt: jest.Mock };
    let permissionService: {
        hasChannelPermission: jest.Mock;
        hasPermission: jest.Mock;
    };
    let pingService: { addPing: jest.Mock };
    let wsServer: {
        isUserOnline: jest.Mock;
        broadcastToUser: jest.Mock;
        on: jest.Mock;
    };

    const message = {
        messageId: MESSAGE_ID,
        _id: MESSAGE_ID,
        serverId: SERVER_ID,
        channelId: CHANNEL_ID,
        senderId: SENDER_ID,
        senderUsername: 'sender',
        text: `hello <userid:'${VISIBLE_USER_ID}'>`,
        createdAt: new Date().toISOString(),
    };

    beforeEach(() => {
        userRepo = {
            findById: jest.fn(async (id: Types.ObjectId) => ({
                _id: id,
                username:
                    id.toString() === HIDDEN_USER_ID ? 'hidden' : 'visible',
            })),
        };
        serverMemberRepo = {
            findByServerAndUser: jest.fn().mockResolvedValue({
                userId: VISIBLE_USER_ID,
                roles: [],
            }),
            findByServerId: jest.fn().mockResolvedValue([
                {
                    userId: VISIBLE_USER_ID,
                    roles: [new Types.ObjectId(ROLE_ID)],
                },
                {
                    userId: new Types.ObjectId(HIDDEN_USER_ID),
                    roles: [new Types.ObjectId(ROLE_ID)],
                },
                {
                    userId: new Types.ObjectId(SENDER_ID),
                    roles: [new Types.ObjectId(ROLE_ID)],
                },
            ]),
        };
        channelRepo = {
            findById: jest.fn().mockResolvedValue({
                _id: new Types.ObjectId(CHANNEL_ID),
                serverId: new Types.ObjectId(SERVER_ID),
                name: 'private-room',
                type: 'text',
            }),
            updateLastMessageAt: jest.fn(),
        };
        permissionService = {
            hasChannelPermission: jest.fn(
                async (_serverId, userId: Types.ObjectId, _channelId, perm) =>
                    perm === 'viewChannels' &&
                    userId.toString() !== HIDDEN_USER_ID,
            ),
            hasPermission: jest.fn().mockResolvedValue(true),
        };
        pingService = { addPing: jest.fn().mockResolvedValue({}) };
        wsServer = {
            isUserOnline: jest.fn().mockResolvedValue(true),
            broadcastToUser: jest.fn(),
            on: jest.fn(),
        };

        controller = new ServerController(
            { findById: jest.fn() } as any,
            userRepo as any,
            {} as any,
            serverMemberRepo as any,
            channelRepo as any,
            {} as any,
            {} as any,
            permissionService as any,
            pingService as any,
            {} as any,
            { runInTransaction: jest.fn() },
            { getClient: jest.fn() } as any,
            {} as any,
            {} as any,
        );
        (controller as any).wsServer = wsServer;
        handleMentions = (controller as any).handleMentions.bind(controller);
    });

    it('does not store or emit a direct mention ping when the mentioned user cannot view the channel', async () => {
        await handleMentions(
            SERVER_ID,
            CHANNEL_ID,
            SENDER_ID,
            'sender',
            [HIDDEN_USER_ID],
            [],
            false,
            message,
        );

        expect(pingService.addPing).not.toHaveBeenCalled();
        expect(wsServer.broadcastToUser).not.toHaveBeenCalled();
    });

    it('stores and emits a direct mention ping when the mentioned user can view the channel', async () => {
        await handleMentions(
            SERVER_ID,
            CHANNEL_ID,
            SENDER_ID,
            'sender',
            [VISIBLE_USER_ID],
            [],
            false,
            message,
        );

        expect(pingService.addPing).toHaveBeenCalledWith(
            VISIBLE_USER_ID,
            expect.objectContaining({
                type: 'mention',
                sender: 'sender',
                serverId: SERVER_ID,
                channelId: CHANNEL_ID,
            }),
        );
        expect(wsServer.broadcastToUser).toHaveBeenCalledWith(
            VISIBLE_USER_ID,
            expect.objectContaining({ type: 'mention' }),
        );
    });

    it('filters role mentions to members who can view the channel', async () => {
        await handleMentions(
            SERVER_ID,
            CHANNEL_ID,
            SENDER_ID,
            'sender',
            [],
            [ROLE_ID],
            false,
            message,
        );

        expect(pingService.addPing).toHaveBeenCalledTimes(1);
        expect(pingService.addPing).toHaveBeenCalledWith(
            VISIBLE_USER_ID,
            expect.any(Object),
        );
        expect(wsServer.broadcastToUser).toHaveBeenCalledTimes(1);
        expect(wsServer.broadcastToUser).toHaveBeenCalledWith(
            VISIBLE_USER_ID,
            expect.any(Object),
        );
    });

    it('filters everyone mentions to members who can view the channel', async () => {
        await handleMentions(
            SERVER_ID,
            CHANNEL_ID,
            SENDER_ID,
            'sender',
            [],
            [],
            true,
            message,
        );

        expect(pingService.addPing).toHaveBeenCalledTimes(1);
        expect(pingService.addPing).toHaveBeenCalledWith(
            VISIBLE_USER_ID,
            expect.any(Object),
        );
        expect(wsServer.broadcastToUser).toHaveBeenCalledTimes(1);
        expect(wsServer.broadcastToUser).toHaveBeenCalledWith(
            VISIBLE_USER_ID,
            expect.any(Object),
        );
    });
});
