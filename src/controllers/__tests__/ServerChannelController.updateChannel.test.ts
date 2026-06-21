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
    findById: jest.fn(),
    update: jest.fn(),
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
const mockExportService = {};
const mockServerRepo = {};
const mockAuditLogRepo = {};
const mockServerAuditLogService = {
    createAndBroadcast: jest.fn(),
};
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
        mockRoleRepo as unknown as IRoleRepository,
        mockRedisService as unknown as IRedisService,
    );
}

describe('ServerChannelController - updateChannel', () => {
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

    it('updates a channel and handles categoryId correctly when null', async () => {
        mockChannelRepo.findById.mockResolvedValue({
            _id: channelId,
            serverId: serverId,
            name: 'old-name',
            type: 'text',
        });
        mockChannelRepo.update.mockResolvedValue({
            _id: channelId,
            serverId: serverId,
            name: 'new-name',
            categoryId: null,
            type: 'text',
        });

        await controller.updateChannel(
            serverId.toHexString(),
            channelId.toHexString(),
            req.user?.id as string,
            {
                name: 'new-name',
                categoryId: null,
            },
        );

        expect(mockChannelRepo.update).toHaveBeenCalledWith(
            expect.any(Types.ObjectId),
            expect.objectContaining({
                name: 'new-name',
                categoryId: null,
            }),
        );
        expect(mockPermissionService.invalidateCache).toHaveBeenCalledWith(
            serverId,
        );
    });

    it('updates a channel and handles categoryId correctly when undefined', async () => {
        mockChannelRepo.findById.mockResolvedValue({
            _id: channelId,
            serverId: serverId,
            name: 'old-name',
            type: 'text',
        });
        mockChannelRepo.update.mockResolvedValue({
            _id: channelId,
            serverId: serverId,
            name: 'new-name',
            type: 'text',
        });

        await controller.updateChannel(
            serverId.toHexString(),
            channelId.toHexString(),
            req.user?.id as string,
            {
                name: 'new-name',
            },
        );

        expect(mockChannelRepo.update).toHaveBeenCalledWith(
            expect.any(Types.ObjectId),
            expect.objectContaining({
                name: 'new-name',
            }),
        );
        expect(mockChannelRepo.update.mock.calls[0][1]).not.toHaveProperty(
            'categoryId',
        );
    });

    it('updates a channel and handles categoryId correctly when given an ID', async () => {
        const catId = new Types.ObjectId();
        mockChannelRepo.findById.mockResolvedValue({
            _id: channelId,
            serverId: serverId,
            name: 'old-name',
            type: 'text',
        });
        mockChannelRepo.update.mockResolvedValue({
            _id: channelId,
            serverId: serverId,
            name: 'new-name',
            categoryId: catId,
            type: 'text',
        });

        await controller.updateChannel(
            serverId.toHexString(),
            channelId.toHexString(),
            req.user?.id as string,
            {
                name: 'new-name',
                categoryId: catId.toHexString(),
            },
        );

        expect(mockChannelRepo.update).toHaveBeenCalledWith(
            expect.any(Types.ObjectId),
            expect.objectContaining({
                name: 'new-name',
                categoryId: expect.any(Types.ObjectId),
            }),
        );
    });

    it('throws 403 if user lacks manageChannels permission', async () => {
        mockPermissionService.hasPermission.mockResolvedValue(false);
        await expect(
            controller.updateChannel(
                serverId.toHexString(),
                channelId.toHexString(),
                req.user?.id as string,
                {
                    name: 'test',
                },
            ),
        ).rejects.toThrow('No permission to manage channels');
    });

    it('throws 404 if channel does not exist', async () => {
        mockChannelRepo.findById.mockResolvedValue(null);
        await expect(
            controller.updateChannel(
                serverId.toHexString(),
                channelId.toHexString(),
                req.user?.id as string,
                {
                    name: 'test',
                },
            ),
        ).rejects.toThrow('Channel not found');
    });
});
