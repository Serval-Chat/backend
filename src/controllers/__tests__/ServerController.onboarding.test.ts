import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Types } from 'mongoose';
import type { Request } from 'express';

import { ServerController } from '../ServerController';
import { IsHumanGuard } from '@/modules/auth/bot.guard';

describe('ServerController onboarding settings', () => {
    const serverId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const serverIdStr = serverId.toHexString();
    const userIdStr = userId.toHexString();
    const req = {
        user: { id: userIdStr },
    } as Request;

    const mockServerRepo = {
        findById: jest.fn(),
        update: jest.fn(),
    };
    const mockServerMemberRepo = {};
    const mockChannelRepo = {
        findByIdAndServer: jest.fn(),
        findByServerId: jest.fn(),
    };
    const mockRoleRepo = {
        findByServerId: jest.fn(),
    };
    const mockUserRepo = {};
    const mockInviteRepo = {};
    const mockServerMessageRepo = {};
    const mockServerBanRepo = {};
    const mockServerChannelReadRepo = {};
    const mockPermissionService = {
        hasPermission: jest.fn(),
        requirePermission: jest.fn(async function (
            this: { hasPermission: (...args: unknown[]) => Promise<boolean> },
            serverId: unknown,
            userId: unknown,
            permission: unknown,
            error: Error,
        ) {
            if (
                (await this.hasPermission(serverId, userId, permission)) !==
                true
            ) {
                throw error;
            }
        }),
        invalidateCache: jest.fn(),
    };
    const mockWsServer = {
        broadcastToServer: jest.fn(),
    };
    const mockPingService = {};
    const mockLogger = {
        warn: jest.fn(),
        error: jest.fn(),
    };
    const mockAuditLogRepo = {};
    const mockServerAuditLogService = {
        createAndBroadcast: jest.fn(),
    };
    const mockRedisService = {};
    const mockDiscoveryService = {
        refreshServer: jest.fn(),
    };

    let controller: ServerController;

    beforeEach(() => {
        jest.clearAllMocks();
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
            mockServerAuditLogService,
            mockRedisService as never,
            mockDiscoveryService as never,
        );
    });

    const existingServer = {
        _id: serverId,
        name: 'Test',
        ownerId: userId,
        onboarding: {
            enabled: false,
            guidelines: [],
            selfAssignableRoleIds: [],
            landingChannelId: null,
            welcomeChannelIds: [],
        },
    };

    it('marks onboarding settings endpoints as human-only', () => {
        const guardedMethods: Array<keyof ServerController> = [
            'getOnboardingSettings',
            'updateOnboardingSettings',
        ];

        for (const methodName of guardedMethods) {
            const guards =
                Reflect.getMetadata(
                    GUARDS_METADATA,
                    ServerController.prototype[methodName],
                ) ?? [];
            expect(guards).toContain(IsHumanGuard);
        }
    });

    it('requires manageServer permission', async () => {
        mockPermissionService.hasPermission.mockResolvedValueOnce(false);

        await expect(
            controller.getOnboardingSettings(
                serverIdStr,
                req.user?.id as string,
            ),
        ).rejects.toThrow('No permission to manage server');

        expect(mockServerRepo.findById).not.toHaveBeenCalled();
    });

    it('rejects @everyone and managed roles as self-assignable roles', async () => {
        const everyoneId = new Types.ObjectId();
        const managedId = new Types.ObjectId();
        mockPermissionService.hasPermission.mockResolvedValue(true);
        mockServerRepo.findById.mockResolvedValue(existingServer);
        mockRoleRepo.findByServerId.mockResolvedValue([
            {
                _id: new Types.ObjectId(),
                snowflakeId: everyoneId.toHexString(),
                serverId,
                name: '@everyone',
                managed: false,
            },
            {
                _id: new Types.ObjectId(),
                snowflakeId: managedId.toHexString(),
                serverId,
                name: 'Bot',
                managed: true,
            },
        ]);

        await expect(
            controller.updateOnboardingSettings(
                serverIdStr,
                req.user?.id as string,
                {
                    selfAssignableRoleIds: [everyoneId.toHexString()],
                },
            ),
        ).rejects.toThrow('The @everyone role cannot be self-assignable');

        await expect(
            controller.updateOnboardingSettings(
                serverIdStr,
                req.user?.id as string,
                {
                    selfAssignableRoleIds: [managedId.toHexString()],
                },
            ),
        ).rejects.toThrow('Managed roles cannot be self-assignable');
    });

    it('rejects a link channel as the landing channel', async () => {
        const channelId = new Types.ObjectId();
        mockPermissionService.hasPermission.mockResolvedValueOnce(true);
        mockServerRepo.findById.mockResolvedValueOnce(existingServer);
        mockChannelRepo.findByIdAndServer.mockResolvedValueOnce({
            _id: channelId,
            serverId,
            type: 'link',
            name: 'docs',
        });

        await expect(
            controller.updateOnboardingSettings(
                serverIdStr,
                req.user?.id as string,
                {
                    landingChannelId: channelId.toHexString(),
                },
            ),
        ).rejects.toThrow('Landing channel cannot be a link channel');
    });

    it('rejects more than eight welcome channels', async () => {
        mockPermissionService.hasPermission.mockResolvedValueOnce(true);
        mockServerRepo.findById.mockResolvedValueOnce(existingServer);

        await expect(
            controller.updateOnboardingSettings(
                serverIdStr,
                req.user?.id as string,
                {
                    welcomeChannelIds: Array.from({ length: 9 }, () =>
                        new Types.ObjectId().toHexString(),
                    ),
                },
            ),
        ).rejects.toThrow('Welcome channels cannot exceed 8');
    });

    it('updates valid onboarding settings and broadcasts server_updated', async () => {
        const roleId = new Types.ObjectId();
        const landingChannelId = new Types.ObjectId();
        const welcomeChannelId = new Types.ObjectId();
        const updatedOnboarding = {
            enabled: true,
            guidelines: ['Be kind'],
            selfAssignableRoleIds: [roleId.toHexString()],
            landingChannelId: landingChannelId.toHexString(),
            welcomeChannelIds: [welcomeChannelId.toHexString()],
        };

        mockPermissionService.hasPermission.mockResolvedValueOnce(true);
        mockServerRepo.findById.mockResolvedValueOnce(existingServer);
        mockRoleRepo.findByServerId.mockResolvedValueOnce([
            {
                _id: new Types.ObjectId(),
                snowflakeId: roleId.toHexString(),
                serverId,
                name: 'News',
                managed: false,
            },
        ]);
        mockChannelRepo.findByIdAndServer.mockResolvedValueOnce({
            _id: landingChannelId,
            serverId,
            type: 'text',
            name: 'start',
        });
        mockChannelRepo.findByServerId.mockResolvedValueOnce([
            {
                _id: new Types.ObjectId(),
                snowflakeId: welcomeChannelId.toHexString(),
                serverId,
                type: 'text',
                name: 'announcements',
            },
        ]);
        mockServerRepo.update.mockResolvedValueOnce({
            ...existingServer,
            onboarding: updatedOnboarding,
        });

        const result = await controller.updateOnboardingSettings(
            serverIdStr,
            req.user?.id as string,
            {
                enabled: true,
                guidelines: ['Be kind'],
                selfAssignableRoleIds: [roleId.toHexString()],
                landingChannelId: landingChannelId.toHexString(),
                welcomeChannelIds: [welcomeChannelId.toHexString()],
            },
        );

        expect(result).toEqual(updatedOnboarding);
        expect(mockServerRepo.update).toHaveBeenCalledWith(serverIdStr, {
            onboarding: updatedOnboarding,
        });
        expect(mockWsServer.broadcastToServer).toHaveBeenCalledWith(
            serverIdStr,
            expect.objectContaining({ type: 'server_updated' }),
        );
        expect(
            mockServerAuditLogService.createAndBroadcast,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                actionType: 'update_server',
                changes: [
                    expect.objectContaining({
                        field: 'onboarding',
                        after: updatedOnboarding,
                    }),
                ],
            }),
        );
    });
});
