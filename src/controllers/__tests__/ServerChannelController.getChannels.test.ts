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

function makeChannel(
    overrides: {
        _id?: Types.ObjectId;
        type?: 'text' | 'voice' | 'link';
        categoryId?: Types.ObjectId | null;
        slowMode?: number;
    } = {},
) {
    return {
        _id: overrides._id ?? new Types.ObjectId(),
        serverId: new Types.ObjectId(),
        type: overrides.type ?? 'text',
        name: 'general',
        categoryId: overrides.categoryId ?? null,
        permissions: {},
        slowMode: overrides.slowMode,
        lastMessageAt: undefined,
    };
}

function makePermMap(
    entries: [Types.ObjectId, boolean][],
): Map<string, boolean> {
    return new Map(entries.map(([id, v]) => [id.toString(), v]));
}

const mockChannelRepo = { findByServerId: jest.fn() };
const mockServerMemberRepo = { findByServerAndUser: jest.fn() };
const mockServerChannelReadRepo = { findByServerAndUser: jest.fn() };
const mockCategoryRepo = {};
const mockServerMessageRepo = { findLastByChannelAndUser: jest.fn() };
const mockPermissionService = {
    hasChannelPermissions: jest.fn(),
    hasCategoryPermissions: jest.fn(),
    normalizePermissionMap: jest.fn(),
};
const mockLogger = { error: jest.fn(), warn: jest.fn() };
const mockWsServer = {};
const mockExportService = {};
const mockServerRepo = {};
const mockAuditLogRepo = {};
const mockServerAuditLogService = {};
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

const userId = new Types.ObjectId();
const serverId = new Types.ObjectId();
const req = {
    user: { id: userId.toHexString() } as JWTPayload,
} as unknown as Request;

describe('ServerChannelController - getChannels visibility', () => {
    let controller: ServerChannelController;

    beforeEach(() => {
        jest.clearAllMocks();
        controller = buildController();
        mockServerChannelReadRepo.findByServerAndUser.mockResolvedValue([]);
        mockPermissionService.normalizePermissionMap.mockResolvedValue({});
        mockServerMessageRepo.findLastByChannelAndUser.mockResolvedValue(null);
    });

    it('throws 403 when the caller is not a server member', async () => {
        mockServerMemberRepo.findByServerAndUser.mockResolvedValue(null);
        mockChannelRepo.findByServerId.mockResolvedValue([]);

        await expect(
            controller.getChannels(serverId.toHexString(), req),
        ).rejects.toThrow();

        expect(
            mockPermissionService.hasChannelPermissions,
        ).not.toHaveBeenCalled();
        expect(
            mockPermissionService.hasCategoryPermissions,
        ).not.toHaveBeenCalled();
    });

    it('shows a channel when viewChannels=true and no parent category', async () => {
        const chId = new Types.ObjectId();
        const ch = makeChannel({ _id: chId, categoryId: null });

        mockServerMemberRepo.findByServerAndUser.mockResolvedValue({ userId });
        mockChannelRepo.findByServerId.mockResolvedValue([ch]);
        mockPermissionService.hasChannelPermissions.mockResolvedValue(
            makePermMap([[chId, true]]),
        );
        mockPermissionService.hasCategoryPermissions.mockResolvedValue(
            new Map(),
        );

        const result = await controller.getChannels(
            serverId.toHexString(),
            req,
        );

        expect(result).toHaveLength(1);
        expect(result[0]?.id).toBe(chId.toString());
    });

    it('hides a channel when viewChannels=false', async () => {
        const chId = new Types.ObjectId();
        const ch = makeChannel({ _id: chId, categoryId: null });

        mockServerMemberRepo.findByServerAndUser.mockResolvedValue({ userId });
        mockChannelRepo.findByServerId.mockResolvedValue([ch]);
        mockPermissionService.hasChannelPermissions.mockResolvedValue(
            makePermMap([[chId, false]]),
        );
        mockPermissionService.hasCategoryPermissions.mockResolvedValue(
            new Map(),
        );

        const result = await controller.getChannels(
            serverId.toHexString(),
            req,
        );

        expect(result).toHaveLength(0);
    });

    it('shows a channel when viewChannels=true and its parent category has viewCategories=true', async () => {
        const catId = new Types.ObjectId();
        const chId = new Types.ObjectId();
        const ch = makeChannel({ _id: chId, categoryId: catId });

        mockServerMemberRepo.findByServerAndUser.mockResolvedValue({ userId });
        mockChannelRepo.findByServerId.mockResolvedValue([ch]);
        mockPermissionService.hasChannelPermissions.mockResolvedValue(
            makePermMap([[chId, true]]),
        );
        mockPermissionService.hasCategoryPermissions.mockResolvedValue(
            makePermMap([[catId, true]]),
        );

        const result = await controller.getChannels(
            serverId.toHexString(),
            req,
        );

        expect(result).toHaveLength(1);
        expect(result[0]?.id).toBe(chId.toString());
    });

    it('hides a channel when viewChannels=true but its parent category has viewCategories=false', async () => {
        const catId = new Types.ObjectId();
        const chId = new Types.ObjectId();
        const ch = makeChannel({ _id: chId, categoryId: catId });

        mockServerMemberRepo.findByServerAndUser.mockResolvedValue({ userId });
        mockChannelRepo.findByServerId.mockResolvedValue([ch]);
        mockPermissionService.hasChannelPermissions.mockResolvedValue(
            makePermMap([[chId, true]]),
        );
        mockPermissionService.hasCategoryPermissions.mockResolvedValue(
            makePermMap([[catId, false]]),
        );

        const result = await controller.getChannels(
            serverId.toHexString(),
            req,
        );

        expect(result).toHaveLength(0);
    });

    it("includes each channel's parent category ID in the hasCategoryPermissions call", async () => {
        const catId = new Types.ObjectId();
        const chId = new Types.ObjectId();
        const ch = makeChannel({ _id: chId, categoryId: catId });

        mockServerMemberRepo.findByServerAndUser.mockResolvedValue({ userId });
        mockChannelRepo.findByServerId.mockResolvedValue([ch]);
        mockPermissionService.hasChannelPermissions.mockResolvedValue(
            new Map(),
        );
        mockPermissionService.hasCategoryPermissions.mockResolvedValue(
            new Map(),
        );

        await controller.getChannels(serverId.toHexString(), req);

        const [, , categoryIds] = mockPermissionService.hasCategoryPermissions
            .mock.calls[0] as [unknown, unknown, Types.ObjectId[]];
        expect(categoryIds.map((id) => id.toString())).toContain(
            catId.toString(),
        );
    });

    it('does not include channels with no categoryId in the hasCategoryPermissions call', async () => {
        const ch = makeChannel({ categoryId: null });

        mockServerMemberRepo.findByServerAndUser.mockResolvedValue({ userId });
        mockChannelRepo.findByServerId.mockResolvedValue([ch]);
        mockPermissionService.hasChannelPermissions.mockResolvedValue(
            new Map(),
        );
        mockPermissionService.hasCategoryPermissions.mockResolvedValue(
            new Map(),
        );

        await controller.getChannels(serverId.toHexString(), req);

        const [, , categoryIds] = mockPermissionService.hasCategoryPermissions
            .mock.calls[0] as [unknown, unknown, Types.ObjectId[]];
        expect(categoryIds).toHaveLength(0);
    });

    it('deduplicates category IDs passed to hasCategoryPermissions', async () => {
        const catId = new Types.ObjectId();
        const ch1 = makeChannel({ categoryId: catId });
        const ch2 = makeChannel({ categoryId: catId });

        mockServerMemberRepo.findByServerAndUser.mockResolvedValue({ userId });
        mockChannelRepo.findByServerId.mockResolvedValue([ch1, ch2]);
        mockPermissionService.hasChannelPermissions.mockResolvedValue(
            new Map(),
        );
        mockPermissionService.hasCategoryPermissions.mockResolvedValue(
            makePermMap([[catId, true]]),
        );

        await controller.getChannels(serverId.toHexString(), req);

        const [, , categoryIds] = mockPermissionService.hasCategoryPermissions
            .mock.calls[0] as [unknown, unknown, Types.ObjectId[]];
        const strs = categoryIds.map((id) => id.toString());
        expect(strs).toHaveLength(new Set(strs).size);
        expect(strs).toHaveLength(1);
    });

    it('runs both permission queries in parallel (each called exactly once)', async () => {
        const catId = new Types.ObjectId();
        const ch = makeChannel({ categoryId: catId });

        mockServerMemberRepo.findByServerAndUser.mockResolvedValue({ userId });
        mockChannelRepo.findByServerId.mockResolvedValue([ch]);
        mockPermissionService.hasChannelPermissions.mockResolvedValue(
            new Map(),
        );
        mockPermissionService.hasCategoryPermissions.mockResolvedValue(
            new Map(),
        );

        await controller.getChannels(serverId.toHexString(), req);

        expect(
            mockPermissionService.hasChannelPermissions,
        ).toHaveBeenCalledTimes(1);
        expect(
            mockPermissionService.hasCategoryPermissions,
        ).toHaveBeenCalledTimes(1);
    });
});
