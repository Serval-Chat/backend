/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import type { Request } from 'express';
import type { JWTPayload } from '@/utils/jwt';
import { ServerChannelController } from '../ServerChannelController';

const mockChannelRepo = {
    findByServerId: jest.fn(),
    update: jest.fn(),
};
const mockPermissionService = {
    hasPermission: jest.fn(),
    requirePermission: jest.fn(async function (
        this: { hasPermission: (...args: unknown[]) => Promise<boolean> },
        serverId: unknown,
        userId: unknown,
        permission: unknown,
        error: Error,
    ) {
        if ((await this.hasPermission(serverId, userId, permission)) !== true) {
            throw error;
        }
    }),
    invalidateCache: jest.fn(),
};
const mockWsServer = {
    broadcastToServer: jest.fn(),
    broadcastToServerWithPermission: jest.fn(),
};
const mockServerAuditLogService = {
    createAndBroadcast: jest.fn(),
};

function buildController(): ServerChannelController {
    return new ServerChannelController(
        mockChannelRepo as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockPermissionService as any,
        { error: jest.fn(), warn: jest.fn() } as any,
        mockWsServer as any,
        {} as any,
        {} as any,
        {} as any,
        mockServerAuditLogService,
        {} as any,
        {} as any,
    );
}

describe('ServerChannelController - reorderChannels WS visibility', () => {
    const serverId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const hiddenChannelId = new Types.ObjectId();
    const req = {
        user: { id: userId.toHexString() } as JWTPayload,
    } as Request;

    beforeEach(() => {
        jest.clearAllMocks();
        mockPermissionService.hasPermission.mockResolvedValue(true);
        mockChannelRepo.findByServerId.mockResolvedValue([
            {
                _id: hiddenChannelId,
                serverId,
                name: 'secret-plans',
                type: 'text',
                position: 0,
            },
        ]);
        mockChannelRepo.update.mockResolvedValue(undefined);
        mockServerAuditLogService.createAndBroadcast.mockResolvedValue(
            undefined,
        );
        mockWsServer.broadcastToServerWithPermission.mockResolvedValue(
            undefined,
        );
    });

    it('does not broadcast a hidden channel reorder event to every server subscriber', async () => {
        const controller = buildController();
        const channelPositions = [
            { channelId: hiddenChannelId.toHexString(), position: 1 },
        ];

        await controller.reorderChannels(
            serverId.toHexString(),
            req.user?.id as string,
            {
                channelPositions,
            },
        );

        expect(mockWsServer.broadcastToServer).not.toHaveBeenCalledWith(
            serverId.toHexString(),
            expect.objectContaining({ type: 'channels_reordered' }),
        );
        expect(
            mockWsServer.broadcastToServerWithPermission,
        ).toHaveBeenCalledWith(
            serverId.toHexString(),
            {
                type: 'channels_reordered',
                payload: {
                    serverId: serverId.toHexString(),
                    channelPositions,
                    senderId: userId.toHexString(),
                },
            },
            {
                type: 'channel',
                targetId: hiddenChannelId.toHexString(),
                permission: 'viewChannels',
            },
        );
    });
});
