import { Types } from 'mongoose';
import type { Request } from 'express';

import { ServerController } from '../ServerController';
import { Emoji } from '@/models/Emoji';

describe('ServerController.getServerStats', () => {
    const serverId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const ownerId = new Types.ObjectId();
    const invisibleMemberId = new Types.ObjectId();
    const serverIdStr = serverId.toHexString();
    const userIdStr = userId.toHexString();

    const mockServerRepo = {
        findById: jest.fn(),
        update: jest.fn(),
    };
    const mockServerMemberRepo = {
        findByServerAndUser: jest.fn(),
        findByServerId: jest.fn(),
    };
    const mockChannelRepo = {
        findByServerId: jest.fn().mockResolvedValue([]),
    };
    const mockRoleRepo = {};
    const mockUserRepo = {
        findByIds: jest.fn(),
        findById: jest.fn(),
    };
    const mockInviteRepo = {};
    const mockServerMessageRepo = {};
    const mockServerBanRepo = {
        findByServerId: jest.fn().mockResolvedValue([]),
    };
    const mockServerChannelReadRepo = {};
    const mockPermissionService = {};
    const mockWsServer = {
        isUserOnline: jest.fn(),
    };
    const mockPingService = {};
    const mockLogger = { warn: jest.fn(), error: jest.fn() };
    const mockAuditLogRepo = {};
    const mockServerAuditLogService = {};
    const mockRedisService = {};
    const mockDiscoveryService = {};

    let controller: ServerController;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(Emoji, 'countDocuments').mockReturnValue({
            exec: jest.fn().mockResolvedValue(0),
        } as never);

        controller = new ServerController(
            mockServerRepo as never,
            mockServerMemberRepo as never,
            mockChannelRepo as never,
            mockRoleRepo as never,
            mockUserRepo as never,
            mockInviteRepo as never,
            mockServerMessageRepo as never,
            mockServerBanRepo as never,
            mockServerChannelReadRepo as never,
            mockPermissionService as never,
            mockWsServer as never,
            mockPingService as never,
            mockLogger as never,
            mockAuditLogRepo as never,
            mockServerAuditLogService as never,
            mockRedisService as never,
            mockDiscoveryService as never,
        );

        mockServerMemberRepo.findByServerAndUser.mockResolvedValue({
            userId,
            serverId,
        });
        mockServerRepo.findById.mockResolvedValue({
            id: serverIdStr,
            name: 'Test server',
            ownerId: ownerId.toHexString(),
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            allTimeHigh: 0,
        });
        mockUserRepo.findById.mockResolvedValue({
            username: 'owner',
            displayName: null,
        });
    });

    it('does not count a member who set themselves to offline/invisible in the online count, even though they are actually connected', async () => {
        mockServerMemberRepo.findByServerId.mockResolvedValue([
            { userId: invisibleMemberId, joinedAt: new Date() },
        ]);
        mockUserRepo.findByIds.mockResolvedValue([
            {
                snowflakeId: invisibleMemberId.toHexString(),
                username: 'invisible-member',
                presenceStatus: 'offline',
            },
        ]);
        mockWsServer.isUserOnline.mockResolvedValue(true);

        const stats = await controller.getServerStats(serverIdStr, userIdStr);

        expect(stats.onlineCount).toBe(0);
    });

    it('still counts a normally-visible member (e.g. dnd) as online', async () => {
        const dndMemberId = new Types.ObjectId();
        mockServerMemberRepo.findByServerId.mockResolvedValue([
            { userId: dndMemberId, joinedAt: new Date() },
        ]);
        mockUserRepo.findByIds.mockResolvedValue([
            {
                snowflakeId: dndMemberId.toHexString(),
                username: 'dnd-member',
                presenceStatus: 'dnd',
            },
        ]);
        mockWsServer.isUserOnline.mockResolvedValue(true);

        const stats = await controller.getServerStats(serverIdStr, userIdStr);

        expect(stats.onlineCount).toBe(1);
    });
});
