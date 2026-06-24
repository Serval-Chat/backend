/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import type { Request } from 'express';
import type { JWTPayload } from '@/utils/jwt';
import { ServerChannelController } from '../ServerChannelController';

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

describe('ServerChannelController - deleteChannel', () => {
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
            req.user?.id as string,
        );
        expect(result).toEqual({ message: 'Channel deleted' });

        expect(mockExportService.handleChannelDeletion).toHaveBeenCalledWith(
            expect.any(String),
            'test-channel',
            'test-server',
        );
        expect(mockChannelRepo.delete).toHaveBeenCalledWith(expect.any(String));
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
            serverId.toHexString(),
        );
    });

    it('throws 403 if user lacks manageChannels permission', async () => {
        mockPermissionService.hasPermission.mockResolvedValue(false);
        await expect(
            controller.deleteChannel(
                serverId.toHexString(),
                channelId.toHexString(),
                req.user?.id as string,
            ),
        ).rejects.toThrow('No permission to manage channels');
    });
});
