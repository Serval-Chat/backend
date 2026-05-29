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
import type { LiveKitService } from '@/services/LiveKitService';
import type { IRoleRepository } from '@/di/interfaces/IRoleRepository';
import type { IRedisService } from '@/di/interfaces/IRedisService';

const mockChannelRepo = {
    findById: jest.fn(),
    delete: jest.fn(),
};
const mockServerMemberRepo = {};
const mockServerChannelReadRepo = {};
const mockCategoryRepo = {};
const mockServerMessageRepo = {};
const mockPermissionService = {
    hasPermission: jest.fn(),
    invalidateCache: jest.fn(),
};

const mockLogger = { error: jest.fn(), warn: jest.fn() };
const mockWsServer = {
    broadcastToServer: jest.fn(),
};
const mockExportService = {
    handleChannelDeletion: jest.fn(),
};
const mockServerRepo = {
    findById: jest.fn(),
};
const mockAuditLogRepo = {};
const mockServerAuditLogService = {
    createAndBroadcast: jest.fn(),
};
const mockLiveKitService = {};
const mockRoleRepo = {};
const mockRedisService = {};

function buildController(): ServerChannelController {
    return new ServerChannelController(
        mockChannelRepo as unknown as IChannelRepository,
        mockServerMemberRepo as unknown as IServerMemberRepository,
        mockServerChannelReadRepo as unknown as IServerChannelReadRepository,
        mockCategoryRepo as unknown as ICategoryRepository,
        mockServerMessageRepo as unknown as IServerMessageRepository,
        mockPermissionService as unknown as PermissionService,
        mockLogger as unknown as ILogger,
        mockWsServer as unknown as WsServer,
        mockExportService as unknown as ExportService,
        mockServerRepo as unknown as IServerRepository,
        mockAuditLogRepo as unknown as IAuditLogRepository,
        mockServerAuditLogService as unknown as IServerAuditLogService,
        mockLiveKitService as unknown as LiveKitService,
        mockRoleRepo as unknown as IRoleRepository,
        mockRedisService as unknown as IRedisService,
    );
}

describe('ServerChannelController - deleteChannel', () => {
    let controller: ServerChannelController;
    const userId = new Types.ObjectId();
    const serverId = new Types.ObjectId();
    const channelId = new Types.ObjectId();
    const req = {
        user: { id: userId.toHexString() } as JWTPayload,
    } as unknown as Request;

    beforeEach(() => {
        jest.clearAllMocks();
        controller = buildController();
        mockPermissionService.hasPermission.mockResolvedValue(true);
    });

    it('deletes a channel successfully', async () => {
        mockChannelRepo.findById.mockResolvedValue({
            _id: channelId,
            serverId: serverId,
            name: 'test-channel',
        });
        mockServerRepo.findById.mockResolvedValue({
            _id: serverId,
            name: 'test-server',
        });
        mockChannelRepo.delete.mockResolvedValue(true);

        const result = await controller.deleteChannel(
            serverId.toHexString(),
            channelId.toHexString(),
            req,
        );
        expect(result).toEqual({ message: 'Channel deleted' });

        expect(mockExportService.handleChannelDeletion).toHaveBeenCalledWith(
            expect.any(Types.ObjectId),
            'test-channel',
            'test-server',
        );
        expect(mockChannelRepo.delete).toHaveBeenCalledWith(
            expect.any(Types.ObjectId),
        );
        expect(mockWsServer.broadcastToServer).toHaveBeenCalledWith(
            serverId.toHexString(),
            expect.objectContaining({
                type: 'channel_deleted',
                payload: {
                    serverId: serverId.toHexString(),
                    channelId: channelId.toHexString(),
                    senderId: userId.toHexString(),
                },
            }),
        );
        expect(mockServerAuditLogService.createAndBroadcast).toHaveBeenCalled();
        expect(mockPermissionService.invalidateCache).toHaveBeenCalledWith(
            serverId,
        );
    });

    it('throws 403 if user lacks manageChannels permission', async () => {
        mockPermissionService.hasPermission.mockResolvedValue(false);
        await expect(
            controller.deleteChannel(
                serverId.toHexString(),
                channelId.toHexString(),
                req,
            ),
        ).rejects.toThrow('No permission to manage channels');
    });
});
