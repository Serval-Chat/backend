import { Types } from 'mongoose';
import type { Request } from 'express';
import type { JWTPayload } from '@/utils/jwt';
import { ServerChannelController } from '../ServerChannelController';
import type { IChannelRepository } from '@/di/interfaces/IChannelRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IServerChannelReadRepository } from '@/di/interfaces/IServerChannelReadRepository';
import type { ICategoryRepository } from '@/di/interfaces/ICategoryRepository';
import type { IServerMessageRepository } from '@/di/interfaces/IServerMessageRepository';
import type { PermissionService } from '@/permissions/PermissionService';
import type { ILogger } from '@/di/interfaces/ILogger';
import type { WsServer } from '@/ws/server';
import type { ExportService } from '@/services/ExportService';
import type { IServerRepository } from '@/di/interfaces/IServerRepository';
import type { IAuditLogRepository } from '@/di/interfaces/IAuditLogRepository';
import type { IServerAuditLogService } from '@/di/interfaces/IServerAuditLogService';
import type { IRoleRepository } from '@/di/interfaces/IRoleRepository';
import type { IRedisService } from '@/di/interfaces/IRedisService';

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
        mockChannelRepo as unknown as IChannelRepository,
        {} as unknown as IServerMemberRepository,
        {} as unknown as IServerChannelReadRepository,
        {} as unknown as ICategoryRepository,
        {} as unknown as IServerMessageRepository,
        mockPermissionService as unknown as PermissionService,
        { error: jest.fn(), warn: jest.fn() } as unknown as ILogger,
        mockWsServer as unknown as WsServer,
        {} as unknown as ExportService,
        {} as unknown as IServerRepository,
        {} as unknown as IAuditLogRepository,
        mockServerAuditLogService as unknown as IServerAuditLogService,
        {} as unknown as IRoleRepository,
        {} as unknown as IRedisService,
    );
}

describe('ServerChannelController - reorderChannels WS visibility', () => {
    const serverId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const hiddenChannelId = new Types.ObjectId();
    const req = {
        user: { id: userId.toHexString() } as JWTPayload,
    } as unknown as Request;

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
