import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Types } from 'mongoose';
import { ServerMemberController } from '../ServerMemberController';
import type { Request } from 'express';
import type { JWTPayload } from '@/utils/jwt';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IServerRepository } from '@/di/interfaces/IServerRepository';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type { IRoleRepository } from '@/di/interfaces/IRoleRepository';
import type { IServerBanRepository } from '@/di/interfaces/IServerBanRepository';
import type { PermissionService } from '@/permissions/PermissionService';
import type { ILogger } from '@/di/interfaces/ILogger';
import type { WsServer } from '@/ws/server';
import type { IServerAuditLogService } from '@/di/interfaces/IServerAuditLogService';
import type { IBlockRepository } from '@/di/interfaces/IBlockRepository';
import type { PingService } from '@/services/PingService';
import type { IChannelRepository } from '@/di/interfaces/IChannelRepository';
import type { ICategoryRepository } from '@/di/interfaces/ICategoryRepository';
import { IsHumanGuard } from '@/modules/auth/bot.guard';

jest.mock('@/models/Bot', () => ({
    Bot: {
        findOne: jest.fn(),
    },
}));

jest.mock('@/models/Server', () => ({
    Role: {
        findOne: jest.fn(),
    },
}));

import { Bot } from '@/models/Bot';
import { Role } from '@/models/Server';

describe('ServerMemberController', () => {
    const meId = new Types.ObjectId();
    const serverId = new Types.ObjectId();
    const meIdStr = meId.toHexString();
    const serverIdStr = serverId.toHexString();

    const mockServerMemberRepo = {
        findByServerAndUser: jest.fn(),
        remove: jest.fn(),
        removeRole: jest.fn(),
        update: jest.fn(),
        updateRoles: jest.fn(),
    };
    const mockServerRepo = {
        findById: jest.fn(),
    };
    const mockUserRepo = {
        findById: jest.fn(),
    };
    const mockRoleRepo = {
        findById: jest.fn(),
        findByServerId: jest.fn(),
    };
    const mockServerBanRepo = {
        create: jest.fn(),
    };
    const mockPermissionService = {
        invalidateCache: jest.fn(),
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
        getHighestRolePosition: jest.fn(),
    };
    const mockLogger = {
        error: jest.fn(),
        warn: jest.fn(),
    };
    const mockWsServer = {
        broadcastToServer: jest.fn(),
        broadcastToUser: jest.fn(),
    };
    const mockServerAuditLogService = {
        createAndBroadcast: jest.fn(),
    };
    const mockBlockRepo = {
        findBlocksByBlocker: jest.fn(),
        findBlocksByTarget: jest.fn(),
    };
    const mockPingService = {
        clearServerPings: jest.fn(),
    };
    const mockChannelRepo = {
        findByServerId: jest.fn(),
    };
    const mockCategoryRepo = {
        findByServerId: jest.fn(),
    };

    let controller: ServerMemberController;

    beforeEach(() => {
        jest.clearAllMocks();
        (Bot.findOne as jest.Mock).mockReturnValue({
            lean: jest.fn().mockResolvedValue(null),
        });
        (Role.findOne as jest.Mock).mockReturnValue({
            lean: jest.fn().mockResolvedValue(null),
        });
        controller = new ServerMemberController(
            mockServerMemberRepo as unknown as IServerMemberRepository,
            mockServerRepo as unknown as IServerRepository,
            mockUserRepo as unknown as IUserRepository,
            mockRoleRepo as unknown as IRoleRepository,
            mockServerBanRepo as unknown as IServerBanRepository,
            mockPermissionService as unknown as PermissionService,
            mockLogger as unknown as ILogger,
            mockWsServer as unknown as WsServer,
            mockServerAuditLogService as unknown as IServerAuditLogService,
            mockBlockRepo as unknown as IBlockRepository,
            mockPingService as unknown as PingService,
            mockChannelRepo as unknown as IChannelRepository,
            mockCategoryRepo as unknown as ICategoryRepository,
        );
    });

    describe('onboarding bot guards', () => {
        it('marks member-facing onboarding endpoints as human-only', () => {
            const guardedMethods: Array<keyof ServerMemberController> = [
                'getOnboarding',
                'acceptOnboardingRules',
                'updateSelfRoles',
                'updateChannelPreferences',
                'completeOnboarding',
            ];

            for (const methodName of guardedMethods) {
                const guards =
                    Reflect.getMetadata(
                        GUARDS_METADATA,
                        ServerMemberController.prototype[methodName],
                    ) ?? [];
                expect(guards).toContain(IsHumanGuard);
            }
        });
    });

    describe('onboarding member state', () => {
        const req = {
            user: { id: meIdStr } as JWTPayload,
        } as unknown as Request;

        it('broadcasts rules acceptance only to the current user', async () => {
            const updatedMember = {
                userId: meId,
                serverId,
                roles: [],
                rulesAcceptedAt: new Date(),
            };

            mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
                userId: meId,
                serverId,
                roles: [],
            });
            mockServerMemberRepo.update.mockResolvedValueOnce(updatedMember);

            const result = await controller.acceptOnboardingRules(
                serverIdStr,
                req.user?.id as string,
            );

            expect(mockServerMemberRepo.update).toHaveBeenCalledWith(
                serverId,
                meId,
                { rulesAcceptedAt: expect.any(Date) },
            );
            expect(mockWsServer.broadcastToUser).toHaveBeenCalledWith(meIdStr, {
                type: 'member_updated',
                payload: {
                    serverId: serverIdStr,
                    userId: meIdStr,
                    member: updatedMember,
                },
            });
            expect(mockWsServer.broadcastToServer).not.toHaveBeenCalled();
            expect(result).toBe(updatedMember);
        });

        it('validates and broadcasts channel preferences only to the current user', async () => {
            const channelId = new Types.ObjectId();
            const categoryId = new Types.ObjectId();
            const updatedMember = {
                userId: meId,
                serverId,
                roles: [],
                hiddenChannelIds: [channelId],
                hiddenCategoryIds: [categoryId],
            };

            mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
                userId: meId,
                serverId,
                roles: [],
            });
            mockChannelRepo.findByServerId.mockResolvedValueOnce([
                { _id: channelId, serverId },
            ]);
            mockCategoryRepo.findByServerId.mockResolvedValueOnce([
                { _id: categoryId, serverId },
            ]);
            mockServerMemberRepo.update.mockResolvedValueOnce(updatedMember);

            const result = await controller.updateChannelPreferences(
                serverIdStr,
                req.user?.id as string,
                {
                    hiddenChannelIds: [channelId.toHexString()],
                    hiddenCategoryIds: [categoryId.toHexString()],
                },
            );

            expect(mockServerMemberRepo.update).toHaveBeenCalledWith(
                serverId,
                meId,
                {
                    hiddenChannelIds: [channelId],
                    hiddenCategoryIds: [categoryId],
                },
            );
            expect(mockWsServer.broadcastToUser).toHaveBeenCalledWith(meIdStr, {
                type: 'member_updated',
                payload: {
                    serverId: serverIdStr,
                    userId: meIdStr,
                    member: updatedMember,
                },
            });
            expect(mockWsServer.broadcastToServer).not.toHaveBeenCalled();
            expect(result).toBe(updatedMember);
        });

        it('rejects channel preferences for channels outside the server', async () => {
            const channelId = new Types.ObjectId();

            mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
                userId: meId,
                serverId,
                roles: [],
            });
            mockChannelRepo.findByServerId.mockResolvedValueOnce([]);
            mockCategoryRepo.findByServerId.mockResolvedValueOnce([]);

            await expect(
                controller.updateChannelPreferences(
                    serverIdStr,
                    req.user?.id as string,
                    {
                        hiddenChannelIds: [channelId.toHexString()],
                        hiddenCategoryIds: [],
                    },
                ),
            ).rejects.toThrow('Hidden channel is not in server');

            expect(mockServerMemberRepo.update).not.toHaveBeenCalled();
            expect(mockWsServer.broadcastToUser).not.toHaveBeenCalled();
        });

        it('broadcasts onboarding completion only to the current user', async () => {
            const updatedMember = {
                userId: meId,
                serverId,
                roles: [],
                onboardingRequired: false,
                onboardingCompletedAt: new Date(),
            };

            mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
                userId: meId,
                serverId,
                roles: [],
            });
            mockServerMemberRepo.update.mockResolvedValueOnce(updatedMember);

            const result = await controller.completeOnboarding(
                serverIdStr,
                req.user?.id as string,
            );

            expect(mockServerMemberRepo.update).toHaveBeenCalledWith(
                serverId,
                meId,
                {
                    onboardingRequired: false,
                    onboardingCompletedAt: expect.any(Date),
                },
            );
            expect(mockWsServer.broadcastToUser).toHaveBeenCalledWith(meIdStr, {
                type: 'member_updated',
                payload: {
                    serverId: serverIdStr,
                    userId: meIdStr,
                    member: updatedMember,
                },
            });
            expect(mockWsServer.broadcastToServer).not.toHaveBeenCalled();
            expect(result).toBe(updatedMember);
        });
    });

    describe('leaveServer', () => {
        const req = {
            user: { id: meIdStr } as JWTPayload,
        } as unknown as Request;

        it('clears server pings when leaving', async () => {
            mockServerRepo.findById.mockResolvedValue({
                _id: serverId,
                ownerId: new Types.ObjectId(), // someone else
            });

            await controller.leaveServer(serverIdStr, req.user?.id as string);

            expect(mockServerMemberRepo.remove).toHaveBeenCalledWith(
                serverId,
                meId,
            );
            expect(mockPingService.clearServerPings).toHaveBeenCalledWith(
                meId,
                serverId,
            );
        });
    });

    describe('updateSelfRoles', () => {
        const req = {
            user: { id: meIdStr } as JWTPayload,
        } as unknown as Request;

        it('rejects roles outside the server allowlist', async () => {
            const allowedRoleId = new Types.ObjectId();
            const blockedRoleId = new Types.ObjectId();

            mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
                userId: meId,
                roles: [],
            });
            mockServerRepo.findById.mockResolvedValueOnce({
                _id: serverId,
                onboarding: {
                    enabled: true,
                    guidelines: [],
                    selfAssignableRoleIds: [allowedRoleId],
                    landingChannelId: null,
                    welcomeChannelIds: [],
                },
            });

            await expect(
                controller.updateSelfRoles(
                    serverIdStr,
                    req.user?.id as string,
                    {
                        roleIds: [blockedRoleId.toHexString()],
                    },
                ),
            ).rejects.toThrow('Role is not self-assignable in this server');

            expect(mockServerMemberRepo.updateRoles).not.toHaveBeenCalled();
        });

        it('preserves roles outside the allowlist when saving self roles', async () => {
            const selfRoleId = new Types.ObjectId();
            const keptRoleId = new Types.ObjectId();
            const updatedMember = {
                userId: meId,
                serverId,
                roles: [keptRoleId, selfRoleId],
                onboardingRequired: true,
                rulesAcceptedAt: new Date(),
                onboardingCompletedAt: new Date(),
                hiddenChannelIds: [new Types.ObjectId()],
                hiddenCategoryIds: [new Types.ObjectId()],
            };

            mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
                userId: meId,
                roles: [keptRoleId],
            });
            mockServerRepo.findById.mockResolvedValueOnce({
                _id: serverId,
                onboarding: {
                    enabled: true,
                    guidelines: [],
                    selfAssignableRoleIds: [selfRoleId],
                    landingChannelId: null,
                    welcomeChannelIds: [],
                },
            });
            mockRoleRepo.findByServerId.mockResolvedValueOnce([
                {
                    _id: selfRoleId,
                    serverId,
                    name: 'News',
                    managed: false,
                },
                {
                    _id: keptRoleId,
                    serverId,
                    name: 'Moderator',
                    managed: false,
                },
            ]);
            mockServerMemberRepo.updateRoles.mockResolvedValueOnce(
                updatedMember,
            );

            const result = await controller.updateSelfRoles(
                serverIdStr,
                req.user?.id as string,
                {
                    roleIds: [selfRoleId.toHexString()],
                },
            );

            expect(mockServerMemberRepo.updateRoles).toHaveBeenCalledWith(
                serverId,
                meId,
                expect.arrayContaining([keptRoleId, selfRoleId]),
            );
            expect(mockWsServer.broadcastToServer).toHaveBeenCalledWith(
                serverIdStr,
                {
                    type: 'member_updated',
                    payload: {
                        serverId: serverIdStr,
                        userId: meIdStr,
                        member: {
                            userId: meId,
                            serverId,
                            roles: [keptRoleId, selfRoleId],
                        },
                    },
                },
            );
            expect(result).toBe(updatedMember);
        });
    });

    describe('kickMember', () => {
        const req = {
            user: { id: meIdStr } as JWTPayload,
        } as unknown as Request;
        const targetId = new Types.ObjectId();
        const targetIdStr = targetId.toHexString();

        it('clears server pings when kicking a member', async () => {
            mockPermissionService.hasPermission.mockResolvedValue(true);
            mockServerMemberRepo.findByServerAndUser.mockResolvedValue({
                userId: targetId,
            });
            mockServerRepo.findById.mockResolvedValue({
                _id: serverId,
                ownerId: meId,
            });
            mockPermissionService.getHighestRolePosition.mockResolvedValueOnce(
                10,
            ); // me
            mockPermissionService.getHighestRolePosition.mockResolvedValueOnce(
                5,
            ); // target

            await controller.kickMember(
                serverIdStr,
                targetIdStr,
                req.user?.id as string,
                {
                    reason: 'test',
                },
            );

            expect(mockServerMemberRepo.remove).toHaveBeenCalledWith(
                serverId,
                targetId,
            );
            expect(mockPingService.clearServerPings).toHaveBeenCalledWith(
                targetId,
                serverId,
            );
        });
    });

    describe('banMember', () => {
        const req = {
            user: { id: meIdStr } as JWTPayload,
        } as unknown as Request;
        const targetId = new Types.ObjectId();
        const targetIdStr = targetId.toHexString();

        it('clears server pings when banning a member', async () => {
            mockPermissionService.hasPermission.mockResolvedValue(true);
            mockServerRepo.findById.mockResolvedValue({
                _id: serverId,
                ownerId: meId,
            });
            mockPermissionService.getHighestRolePosition.mockResolvedValueOnce(
                10,
            ); // me
            mockPermissionService.getHighestRolePosition.mockResolvedValueOnce(
                5,
            ); // target

            await controller.banMember(serverIdStr, req.user?.id as string, {
                userId: targetIdStr,
                reason: 'test',
            });

            expect(mockServerMemberRepo.remove).toHaveBeenCalledWith(
                serverId,
                targetId,
            );
            expect(mockPingService.clearServerPings).toHaveBeenCalledWith(
                targetId,
                serverId,
            );
        });
    });

    describe('removeMemberRole', () => {
        const req = {
            user: { id: meIdStr } as JWTPayload,
        } as unknown as Request;
        const targetId = new Types.ObjectId();
        const targetIdStr = targetId.toHexString();
        const roleId = new Types.ObjectId();
        const roleIdStr = roleId.toHexString();

        it('should throw ForbiddenException if actor lacks manageRoles permission', async () => {
            mockPermissionService.hasPermission.mockResolvedValueOnce(false);

            await expect(
                controller.removeMemberRole(
                    serverIdStr,
                    targetIdStr,
                    roleIdStr,
                    req.user?.id as string,
                ),
            ).rejects.toThrow('No permission to manage roles');
        });

        it('should throw NotFoundException if target member is not found', async () => {
            mockPermissionService.hasPermission.mockResolvedValueOnce(true);
            mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce(
                null,
            );

            await expect(
                controller.removeMemberRole(
                    serverIdStr,
                    targetIdStr,
                    roleIdStr,
                    req.user?.id as string,
                ),
            ).rejects.toThrow('Member not found');
        });

        it('should throw NotFoundException if role is not found', async () => {
            mockPermissionService.hasPermission.mockResolvedValueOnce(true);
            mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
                userId: targetId,
            });
            mockRoleRepo.findById.mockResolvedValueOnce(null);

            await expect(
                controller.removeMemberRole(
                    serverIdStr,
                    targetIdStr,
                    roleIdStr,
                    req.user?.id as string,
                ),
            ).rejects.toThrow('Role not found');
        });

        it('should throw BadRequestException if trying to remove @everyone role', async () => {
            mockPermissionService.hasPermission.mockResolvedValueOnce(true);
            mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
                userId: targetId,
            });
            mockRoleRepo.findById.mockResolvedValueOnce({
                _id: roleId,
                serverId: serverId,
                name: '@everyone',
            });

            await expect(
                controller.removeMemberRole(
                    serverIdStr,
                    targetIdStr,
                    roleIdStr,
                    req.user?.id as string,
                ),
            ).rejects.toThrow('Cannot remove @everyone role from a member');
        });

        it('should throw ForbiddenException if role is managed', async () => {
            mockPermissionService.hasPermission.mockResolvedValueOnce(true);
            mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
                userId: targetId,
            });
            mockRoleRepo.findById.mockResolvedValueOnce({
                _id: roleId,
                serverId: serverId,
                name: 'Managed Bot Role',
                managed: true,
            });

            await expect(
                controller.removeMemberRole(
                    serverIdStr,
                    targetIdStr,
                    roleIdStr,
                    req.user?.id as string,
                ),
            ).rejects.toThrow('Cannot remove a managed role from a member');
        });

        it('should throw ForbiddenException if user is not owner and has equal/lower role than the target member', async () => {
            mockPermissionService.hasPermission.mockResolvedValueOnce(true);
            mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
                userId: targetId,
            });
            mockRoleRepo.findById.mockResolvedValueOnce({
                _id: roleId,
                serverId: serverId,
                name: 'Mod Role',
                position: 10,
            });
            mockServerRepo.findById.mockResolvedValueOnce({
                ownerId: new Types.ObjectId(),
            });
            mockPermissionService.getHighestRolePosition.mockResolvedValueOnce(
                15,
            );
            mockPermissionService.getHighestRolePosition.mockResolvedValueOnce(
                15,
            );

            await expect(
                controller.removeMemberRole(
                    serverIdStr,
                    targetIdStr,
                    roleIdStr,
                    req.user?.id as string,
                ),
            ).rejects.toThrow(
                'You cannot manage roles for a member with a role equal to or higher than your own',
            );
        });

        it('should throw ForbiddenException if user is not owner and target role position is higher or equal to actor highest role', async () => {
            mockPermissionService.hasPermission.mockResolvedValueOnce(true);
            mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
                userId: targetId,
            });
            mockRoleRepo.findById.mockResolvedValueOnce({
                _id: roleId,
                serverId: serverId,
                name: 'Mod Role',
                position: 10,
            });
            mockServerRepo.findById.mockResolvedValueOnce({
                ownerId: new Types.ObjectId(),
            });
            mockPermissionService.getHighestRolePosition.mockResolvedValueOnce(
                8,
            );
            mockPermissionService.getHighestRolePosition.mockResolvedValueOnce(
                5,
            );

            await expect(
                controller.removeMemberRole(
                    serverIdStr,
                    targetIdStr,
                    roleIdStr,
                    req.user?.id as string,
                ),
            ).rejects.toThrow(
                'You cannot remove a role equal to or higher than your own highest role',
            );
        });

        it('should successfully remove role if actor is the server owner', async () => {
            mockPermissionService.hasPermission.mockResolvedValueOnce(true);
            mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
                userId: targetId,
            });
            mockRoleRepo.findById.mockResolvedValueOnce({
                _id: roleId,
                serverId: serverId,
                name: 'Mod Role',
                position: 10,
            });
            mockServerRepo.findById.mockResolvedValueOnce({
                ownerId: meId,
            });

            const mockUpdatedMember = {
                userId: targetId,
                roles: [],
            };
            mockServerMemberRepo.removeRole = jest
                .fn()
                .mockResolvedValueOnce(mockUpdatedMember);

            const result = await controller.removeMemberRole(
                serverIdStr,
                targetIdStr,
                roleIdStr,
                req.user?.id as string,
            );

            expect(mockServerMemberRepo.removeRole).toHaveBeenCalledWith(
                serverId,
                targetId,
                roleId,
            );
            expect(result).toEqual(mockUpdatedMember);
        });

        it('should successfully remove role if actor has permission and is higher in hierarchy', async () => {
            mockPermissionService.hasPermission.mockResolvedValueOnce(true);
            mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
                userId: targetId,
            });
            mockRoleRepo.findById.mockResolvedValueOnce({
                _id: roleId,
                serverId: serverId,
                name: 'Mod Role',
                position: 10,
            });
            mockServerRepo.findById.mockResolvedValueOnce({
                ownerId: new Types.ObjectId(),
            });
            mockPermissionService.getHighestRolePosition.mockResolvedValueOnce(
                20,
            );
            mockPermissionService.getHighestRolePosition.mockResolvedValueOnce(
                15,
            );

            const mockUpdatedMember = {
                userId: targetId,
                roles: [],
            };
            mockServerMemberRepo.removeRole = jest
                .fn()
                .mockResolvedValueOnce(mockUpdatedMember);

            const result = await controller.removeMemberRole(
                serverIdStr,
                targetIdStr,
                roleIdStr,
                req.user?.id as string,
            );

            expect(mockServerMemberRepo.removeRole).toHaveBeenCalledWith(
                serverId,
                targetId,
                roleId,
            );
            expect(result).toEqual(mockUpdatedMember);
        });
    });
});
