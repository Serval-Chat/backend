/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import type { Request } from 'express';
import type { JWTPayload } from '@/utils/jwt';
import { ServerChannelController } from '../ServerChannelController';

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

describe('ServerChannelController - updateChannel', () => {
    let controller: ServerChannelController;
    const userId = new Types.ObjectId();
    const serverId = new Types.ObjectId();
    const channelId = new Types.ObjectId();
    const req = {
        user: { id: userId.toHexString() } as JWTPayload,
    } as Request;

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
            expect.any(String),
            expect.objectContaining({
                name: 'new-name',
                categoryId: null,
            }),
        );
        expect(mockPermissionService.invalidateCache).toHaveBeenCalledWith(
            serverId.toHexString(),
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
            expect.any(String),
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
            expect.any(String),
            expect.objectContaining({
                name: 'new-name',
                categoryId: expect.any(String),
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
