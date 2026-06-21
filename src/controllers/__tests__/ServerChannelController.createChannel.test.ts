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
import { ChannelTypeDTO } from '../dto/common.request.dto';

const mockChannelRepo = {
    create: jest.fn(),
    findMaxPositionByServerId: jest.fn(),
};
const mockServerMemberRepo = {};
const mockServerChannelReadRepo = {};
const mockCategoryRepo = {};
const mockServerMessageRepo = {};
const mockPermissionService = {
    hasPermission: jest.fn(),
    normalizePermissionMap: jest.fn(),
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

describe('ServerChannelController - createChannel', () => {
    let controller: ServerChannelController;
    const userId = new Types.ObjectId();
    const serverId = new Types.ObjectId();
    const req = {
        user: { id: userId.toHexString() } as JWTPayload,
    } as unknown as Request;

    beforeEach(() => {
        jest.clearAllMocks();
        controller = buildController();

        mockPermissionService.hasPermission.mockResolvedValue(true);
        mockPermissionService.normalizePermissionMap.mockResolvedValue({});
        mockChannelRepo.findMaxPositionByServerId.mockResolvedValue({
            position: 0,
        });
    });

    it('creates a channel inside a category when categoryId is provided', async () => {
        const categoryId = new Types.ObjectId().toHexString();

        mockChannelRepo.create.mockImplementation(async (data) => {
            return {
                ...data,
                _id: new Types.ObjectId(),
            };
        });

        await controller.createChannel(
            serverId.toHexString(),
            req.user?.id as string,
            {
                name: 'category-channel',
                type: ChannelTypeDTO.TEXT,
                categoryId,
            },
        );

        expect(mockChannelRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'category-channel',
                categoryId: new Types.ObjectId(categoryId),
            }),
        );
        expect(mockPermissionService.invalidateCache).toHaveBeenCalledWith(
            serverId,
        );
    });

    it('creates a global channel when categoryId is not provided', async () => {
        mockChannelRepo.create.mockImplementation(async (data) => {
            return {
                ...data,
                _id: new Types.ObjectId(),
            };
        });

        await controller.createChannel(
            serverId.toHexString(),
            req.user?.id as string,
            {
                name: 'global-channel',
                type: ChannelTypeDTO.TEXT,
            },
        );

        expect(mockChannelRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'global-channel',
                categoryId: null,
            }),
        );
        expect(mockPermissionService.invalidateCache).toHaveBeenCalledWith(
            serverId,
        );
    });
});
