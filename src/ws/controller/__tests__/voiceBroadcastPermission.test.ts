/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock('@/services/PushService', () => ({
    notifyUser: jest.fn().mockResolvedValue(undefined),
    notifyUsers: jest.fn().mockResolvedValue(undefined),
}));

import { ServerController } from '../ServerController';

const SERVER = '0254710804526399488';
const CHANNEL = '0254710804526399489';
const USER = '0254710804526399490';

const CHANNEL_VIEW_PERMISSION = {
    type: 'channel',
    targetId: CHANNEL,
    permission: 'viewChannels',
};

function fakeRedis() {
    return {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        sadd: jest.fn().mockResolvedValue(1),
        expire: jest.fn().mockResolvedValue(1),
        smembers: jest.fn().mockResolvedValue([]),
        hgetall: jest.fn().mockResolvedValue({}),
        hset: jest.fn().mockResolvedValue(1),
        srem: jest.fn().mockResolvedValue(1),
        hdel: jest.fn().mockResolvedValue(1),
        del: jest.fn().mockResolvedValue(1),
    };
}

function controllerWith(redis: unknown) {
    const controller = Object.create(
        ServerController.prototype,
    ) as ServerController;
    (controller as any).redisService = { getClient: () => redis };
    (controller as any).warningRepo = {
        hasUnacknowledged: jest.fn().mockResolvedValue(false),
    };
    (controller as any).requireVoiceAccess = jest
        .fn()
        .mockResolvedValue(undefined);
    (controller as any).wsServer = {
        broadcastToServer: jest.fn(),
        broadcastToServerWithPermission: jest.fn().mockResolvedValue(undefined),
    };
    return controller;
}

describe('voice broadcasts are scoped to who can see the channel', () => {
    it('user_joined_voice goes through broadcastToServerWithPermission', async () => {
        const controller = controllerWith(fakeRedis());

        await controller.onJoinVoice({ serverId: SERVER, channelId: CHANNEL }, {
            userId: USER,
        } as any);

        const wsServer = (controller as any).wsServer;
        expect(wsServer.broadcastToServer).not.toHaveBeenCalled();
        expect(wsServer.broadcastToServerWithPermission).toHaveBeenCalledWith(
            SERVER,
            {
                type: 'user_joined_voice',
                payload: { serverId: SERVER, channelId: CHANNEL, userId: USER },
            },
            CHANNEL_VIEW_PERMISSION,
        );
    });

    it('user_left_voice goes through broadcastToServerWithPermission', async () => {
        const controller = controllerWith(fakeRedis());

        await (
            controller as unknown as {
                _internalLeaveVoice: (
                    userId: string,
                    serverId: string,
                    channelId: string,
                ) => Promise<void>;
            }
        )._internalLeaveVoice(USER, SERVER, CHANNEL);

        const wsServer = (controller as any).wsServer;
        expect(wsServer.broadcastToServer).not.toHaveBeenCalled();
        expect(wsServer.broadcastToServerWithPermission).toHaveBeenCalledWith(
            SERVER,
            {
                type: 'user_left_voice',
                payload: { serverId: SERVER, channelId: CHANNEL, userId: USER },
            },
            CHANNEL_VIEW_PERMISSION,
        );
    });

    it('voice_state_updated goes through broadcastToServerWithPermission', async () => {
        const controller = controllerWith(fakeRedis());

        await controller.onUpdateVoiceState(
            {
                serverId: SERVER,
                channelId: CHANNEL,
                isMuted: true,
                isDeafened: false,
            },
            { userId: USER } as any,
        );

        const wsServer = (controller as any).wsServer;
        expect(wsServer.broadcastToServer).not.toHaveBeenCalled();
        expect(wsServer.broadcastToServerWithPermission).toHaveBeenCalledWith(
            SERVER,
            {
                type: 'voice_state_updated',
                payload: {
                    serverId: SERVER,
                    channelId: CHANNEL,
                    userId: USER,
                    isMuted: true,
                    isDeafened: false,
                },
            },
            CHANNEL_VIEW_PERMISSION,
        );
    });
});
