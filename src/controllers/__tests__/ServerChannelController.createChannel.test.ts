/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import type { Request } from 'express';
import type { JWTPayload } from '@/utils/jwt';
import { ServerChannelController } from '../ServerChannelController';
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
        mockChannelRepo as any,
        mockServerMemberRepo as any,
        mockServerChannelReadRepo as any,
        mockCategoryRepo as any,
        mockServerMessageRepo as any,
        mockPermissionService as any,
        mockLogger as any,
        mockWsServer as any,
        mockExportService as any,
        mockServerRepo as any,
        mockAuditLogRepo as any,
        mockServerAuditLogService,
        mockRoleRepo as any,
        mockRedisService as any,
    );
}

describe('ServerChannelController - createChannel', () => {
    let controller: ServerChannelController;
    const userId = new Types.ObjectId();
    const serverId = new Types.ObjectId();
    const req = {
        user: { id: userId.toHexString() } as JWTPayload,
    } as Request;

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
                categoryId,
            }),
        );
        expect(mockPermissionService.invalidateCache).toHaveBeenCalledWith(
            serverId.toHexString(),
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
            serverId.toHexString(),
        );
    });
});
