/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import type { Request } from 'express';
import type { JWTPayload } from '@/utils/jwt';
import { ServerChannelController } from '../ServerChannelController';
import { generateSnowflakeId } from '@/utils/snowflake';

function makeChannel(
    overrides: {
        snowflakeId?: string;
        type?: 'text' | 'voice' | 'link';
        categoryId?: string | null;
        slowMode?: number;
    } = {},
) {
    return {
        _id: new Types.ObjectId(),
        snowflakeId: overrides.snowflakeId ?? generateSnowflakeId(),
        serverId: new Types.ObjectId().toString(),
        type: overrides.type ?? 'text',
        name: 'general',
        categoryId: overrides.categoryId ?? null,
        permissions: {},
        slowMode: overrides.slowMode,
        lastMessageAt: undefined,
    };
}

function makePermMap(entries: [string, boolean][]): Map<string, boolean> {
    return new Map(entries);
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
        mockServerAuditLogService as any,
        mockRoleRepo as any,
        mockRedisService as any,
    );
}

const userId = new Types.ObjectId();
const serverId = new Types.ObjectId();
const req = {
    user: { id: userId.toHexString() } as JWTPayload,
} as Request;

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
            controller.getChannels(
                serverId.toHexString(),
                req.user?.id as string,
            ),
        ).rejects.toThrow();

        expect(
            mockPermissionService.hasChannelPermissions,
        ).not.toHaveBeenCalled();
        expect(
            mockPermissionService.hasCategoryPermissions,
        ).not.toHaveBeenCalled();
    });

    it('shows a channel when viewChannels=true and no parent category', async () => {
        const chId = generateSnowflakeId();
        const ch = makeChannel({ snowflakeId: chId, categoryId: null });

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
            req.user?.id as string,
        );

        expect(result).toHaveLength(1);
        expect(result[0]?.id).toBe(chId);
    });

    it('hides a channel when viewChannels=false', async () => {
        const chId = generateSnowflakeId();
        const ch = makeChannel({ snowflakeId: chId, categoryId: null });

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
            req.user?.id as string,
        );

        expect(result).toHaveLength(0);
    });

    it('shows a channel when viewChannels=true and its parent category has viewCategories=true', async () => {
        const catId = generateSnowflakeId();
        const chId = generateSnowflakeId();
        const ch = makeChannel({ snowflakeId: chId, categoryId: catId });

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
            req.user?.id as string,
        );

        expect(result).toHaveLength(1);
        expect(result[0]?.id).toBe(chId);
    });

    it('hides a channel when viewChannels=true but its parent category has viewCategories=false', async () => {
        const catId = generateSnowflakeId();
        const chId = generateSnowflakeId();
        const ch = makeChannel({ snowflakeId: chId, categoryId: catId });

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
            req.user?.id as string,
        );

        expect(result).toHaveLength(0);
    });

    it("includes each channel's parent category ID in the hasCategoryPermissions call", async () => {
        const catId = generateSnowflakeId();
        const chId = generateSnowflakeId();
        const ch = makeChannel({ snowflakeId: chId, categoryId: catId });

        mockServerMemberRepo.findByServerAndUser.mockResolvedValue({ userId });
        mockChannelRepo.findByServerId.mockResolvedValue([ch]);
        mockPermissionService.hasChannelPermissions.mockResolvedValue(
            new Map(),
        );
        mockPermissionService.hasCategoryPermissions.mockResolvedValue(
            new Map(),
        );

        await controller.getChannels(
            serverId.toHexString(),
            req.user?.id as string,
        );

        const [, , categoryIds] = mockPermissionService.hasCategoryPermissions
            .mock.calls[0] as [unknown, unknown, string[]];
        expect(categoryIds).toContain(catId);
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

        await controller.getChannels(
            serverId.toHexString(),
            req.user?.id as string,
        );

        const [, , categoryIds] = mockPermissionService.hasCategoryPermissions
            .mock.calls[0] as [unknown, unknown, string[]];
        expect(categoryIds).toHaveLength(0);
    });

    it('deduplicates category IDs passed to hasCategoryPermissions', async () => {
        const catId = generateSnowflakeId();
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

        await controller.getChannels(
            serverId.toHexString(),
            req.user?.id as string,
        );

        const [, , categoryIds] = mockPermissionService.hasCategoryPermissions
            .mock.calls[0] as [unknown, unknown, string[]];
        expect(categoryIds).toHaveLength(new Set(categoryIds).size);
        expect(categoryIds).toHaveLength(1);
    });

    it('runs both permission queries in parallel (each called exactly once)', async () => {
        const catId = generateSnowflakeId();
        const ch = makeChannel({ categoryId: catId });

        mockServerMemberRepo.findByServerAndUser.mockResolvedValue({ userId });
        mockChannelRepo.findByServerId.mockResolvedValue([ch]);
        mockPermissionService.hasChannelPermissions.mockResolvedValue(
            new Map(),
        );
        mockPermissionService.hasCategoryPermissions.mockResolvedValue(
            new Map(),
        );

        await controller.getChannels(
            serverId.toHexString(),
            req.user?.id as string,
        );

        expect(
            mockPermissionService.hasChannelPermissions,
        ).toHaveBeenCalledTimes(1);
        expect(
            mockPermissionService.hasCategoryPermissions,
        ).toHaveBeenCalledTimes(1);
    });
});
