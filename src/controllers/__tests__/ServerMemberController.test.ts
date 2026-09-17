/* eslint-disable @typescript-eslint/no-explicit-any */
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Types } from 'mongoose';
import { ServerMemberController } from '../ServerMemberController';
import type { Request } from 'express';
import type { JWTPayload } from '@/utils/jwt';
import { IsHumanGuard } from '@/modules/auth/bot.guard';
import {
    mapPublicServerMember,
    mapServerMemberToDTO,
} from '@/utils/serverMember';

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
        addRole: jest.fn(),
        removeRole: jest.fn(),
        update: jest.fn(),
        updateRoles: jest.fn(),
        findByServerIdWithUserInfo: jest.fn(),
        searchMembers: jest.fn(),
        findByServerIdFiltered: jest.fn(),
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
        hasAnyPermission: jest.fn(),
        requireAnyPermission: jest.fn(async function (
            this: {
                hasAnyPermission: (...args: unknown[]) => Promise<boolean>;
            },
            serverId: unknown,
            userId: unknown,
            permissions: unknown,
            error: Error,
        ) {
            if (
                (await this.hasAnyPermission(serverId, userId, permissions)) !==
                true
            ) {
                throw error;
            }
        }),
    };
    const mockLogger = {
        error: jest.fn(),
        warn: jest.fn(),
    };
    const mockWsServer = {
        broadcastToServer: jest.fn(),
        broadcastToUser: jest.fn(),
        isUserOnline: jest.fn(),
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
    const mockMessageRepo = {
        softDeleteByAuthorAfter: jest.fn(),
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
            mockServerMemberRepo as any,
            mockServerRepo as any,
            mockUserRepo as any,
            mockRoleRepo as any,
            mockServerBanRepo as any,
            mockPermissionService as any,
            mockLogger as any,
            mockWsServer as any,
            mockServerAuditLogService,
            mockBlockRepo as any,
            mockPingService as any,
            mockChannelRepo as any,
            mockCategoryRepo as any,
            mockMessageRepo as any,
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
        } as Request;

        it('broadcasts rules acceptance only to the current user', async () => {
            const updatedMember = {
                _id: new Types.ObjectId(),
                snowflakeId: '1000000000000000001',
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
                serverIdStr,
                meIdStr,
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
            expect(result).toEqual(mapServerMemberToDTO(updatedMember as any));
        });

        it('validates and broadcasts channel preferences only to the current user', async () => {
            const channelId = new Types.ObjectId();
            const channelIdStr = channelId.toHexString();
            const categoryId = new Types.ObjectId();
            const categoryIdStr = categoryId.toHexString();
            const updatedMember = {
                _id: new Types.ObjectId(),
                snowflakeId: '1000000000000000002',
                userId: meId,
                serverId,
                roles: [],
                hiddenChannelIds: [channelIdStr],
                hiddenCategoryIds: [categoryIdStr],
            };

            mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
                userId: meId,
                serverId,
                roles: [],
            });
            mockChannelRepo.findByServerId.mockResolvedValueOnce([
                { _id: channelId, snowflakeId: channelIdStr, serverId },
            ]);
            mockCategoryRepo.findByServerId.mockResolvedValueOnce([
                { _id: categoryId, snowflakeId: categoryIdStr, serverId },
            ]);
            mockServerMemberRepo.update.mockResolvedValueOnce(updatedMember);

            const result = await controller.updateChannelPreferences(
                serverIdStr,
                req.user?.id as string,
                {
                    hiddenChannelIds: [channelIdStr],
                    hiddenCategoryIds: [categoryIdStr],
                },
            );

            expect(mockServerMemberRepo.update).toHaveBeenCalledWith(
                serverIdStr,
                meIdStr,
                {
                    hiddenChannelIds: [channelIdStr],
                    hiddenCategoryIds: [categoryIdStr],
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
            expect(result).toEqual(mapServerMemberToDTO(updatedMember as any));
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
                _id: new Types.ObjectId(),
                snowflakeId: '1000000000000000003',
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
                serverIdStr,
                meIdStr,
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
            expect(result).toEqual(mapServerMemberToDTO(updatedMember as any));
        });
    });

    describe('getServerMembers', () => {
        it('reports a member who set themselves to offline/invisible as online: false, even though they are actually connected', async () => {
            const invisibleUserId = new Types.ObjectId();

            mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
                userId: meId,
                serverId,
                roles: [],
            });
            mockServerMemberRepo.findByServerIdWithUserInfo.mockResolvedValueOnce(
                [
                    {
                        userId: invisibleUserId,
                        serverId,
                        roles: [],
                        user: {
                            id: invisibleUserId.toHexString(),
                            username: 'invisible-member',
                            presenceStatus: 'offline',
                        },
                    },
                ],
            );
            mockBlockRepo.findBlocksByBlocker.mockResolvedValueOnce([]);
            mockBlockRepo.findBlocksByTarget.mockResolvedValueOnce([]);
            mockWsServer.isUserOnline.mockResolvedValueOnce(true);

            const result = await controller.getServerMembers(
                serverIdStr,
                meIdStr,
            );

            expect(result).toHaveLength(1);
            expect(result[0]?.online).toBe(false);
        });
    });

    describe('getServerMembersAdmin', () => {
        it('throws ForbiddenException when the caller is not a member', async () => {
            mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce(
                null,
            );

            await expect(
                controller.getServerMembersAdmin(serverIdStr, {}, meIdStr),
            ).rejects.toThrow();

            expect(
                mockPermissionService.requireAnyPermission,
            ).not.toHaveBeenCalled();
        });

        it('throws ForbiddenException when the caller lacks all of banMembers/kickMembers/moderateMembers', async () => {
            mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
                userId: meId,
                serverId,
                roles: [],
            });
            mockPermissionService.hasAnyPermission.mockResolvedValueOnce(false);

            await expect(
                controller.getServerMembersAdmin(serverIdStr, {}, meIdStr),
            ).rejects.toThrow();

            expect(
                mockPermissionService.requireAnyPermission,
            ).toHaveBeenCalledWith(
                serverIdStr,
                meIdStr,
                ['banMembers', 'kickMembers', 'moderateMembers'],
                expect.any(Error),
            );
        });

        it('succeeds when the caller has only one of the required permissions', async () => {
            mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
                userId: meId,
                serverId,
                roles: [],
            });
            mockPermissionService.hasAnyPermission.mockResolvedValueOnce(true);
            mockServerMemberRepo.findByServerIdFiltered.mockResolvedValueOnce({
                members: [],
                total: 0,
            });

            const result = await controller.getServerMembersAdmin(
                serverIdStr,
                {},
                meIdStr,
            );

            expect(result.members).toEqual([]);
            expect(result.total).toBe(0);
        });

        it('applies default limit/offset/sort and forwards filters to the repository', async () => {
            mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
                userId: meId,
                serverId,
                roles: [],
            });
            mockPermissionService.hasAnyPermission.mockResolvedValueOnce(true);
            mockServerMemberRepo.findByServerIdFiltered.mockResolvedValueOnce({
                members: [],
                total: 0,
            });

            await controller.getServerMembersAdmin(
                serverIdStr,
                { roleId: 'role-1', search: 'foo' },
                meIdStr,
            );

            expect(
                mockServerMemberRepo.findByServerIdFiltered,
            ).toHaveBeenCalledWith(serverIdStr, {
                roleId: 'role-1',
                search: 'foo',
                sortBy: 'joinedAt',
                sortDir: 'desc',
                limit: 50,
                offset: 0,
            });
        });

        it('returns total/limit/offset alongside the mapped members, passing joinedVia through unmodified', async () => {
            mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
                userId: meId,
                serverId,
                roles: [],
            });
            mockPermissionService.hasAnyPermission.mockResolvedValueOnce(true);
            mockServerMemberRepo.findByServerIdFiltered.mockResolvedValueOnce({
                members: [
                    {
                        userId: 'user-with-invite',
                        serverId: serverIdStr,
                        roles: [],
                        joinedVia: { method: 'invite', code: 'abc123' },
                        user: null,
                    },
                    {
                        userId: 'user-without-invite',
                        serverId: serverIdStr,
                        roles: [],
                        user: null,
                    },
                ],
                total: 2,
            });

            const result = await controller.getServerMembersAdmin(
                serverIdStr,
                { limit: 10, offset: 0 },
                meIdStr,
            );

            expect(result.total).toBe(2);
            expect(result.limit).toBe(10);
            expect(result.offset).toBe(0);
            expect(result.members[0]?.joinedVia).toEqual({
                method: 'invite',
                code: 'abc123',
            });
            expect(result.members[1]?.joinedVia).toBeUndefined();
        });
    });

    describe('searchMembers', () => {
        it('reports a member who set themselves to offline/invisible as online: false, even though they are actually connected', async () => {
            const invisibleUserId = new Types.ObjectId();

            mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
                userId: meId,
                serverId,
                roles: [],
            });
            mockServerMemberRepo.searchMembers.mockResolvedValueOnce([
                {
                    userId: invisibleUserId,
                    serverId,
                    roles: [],
                    user: {
                        id: invisibleUserId.toHexString(),
                        username: 'invisible-member',
                        presenceStatus: 'offline',
                    },
                },
            ]);
            mockBlockRepo.findBlocksByBlocker.mockResolvedValueOnce([]);
            mockBlockRepo.findBlocksByTarget.mockResolvedValueOnce([]);
            mockWsServer.isUserOnline.mockResolvedValueOnce(true);

            const result = await controller.searchMembers(
                serverIdStr,
                'invisible',
                meIdStr,
            );

            expect(result).toHaveLength(1);
            expect(result[0]?.online).toBe(false);
        });
    });

    describe('leaveServer', () => {
        const req = {
            user: { id: meIdStr } as JWTPayload,
        } as Request;

        it('clears server pings when leaving', async () => {
            mockServerRepo.findById.mockResolvedValue({
                _id: serverId,
                ownerId: new Types.ObjectId(), // someone else
            });

            await controller.leaveServer(serverIdStr, req.user?.id as string);

            expect(mockServerMemberRepo.remove).toHaveBeenCalledWith(
                serverIdStr,
                meIdStr,
            );
            expect(mockPingService.clearServerPings).toHaveBeenCalledWith(
                meIdStr,
                serverIdStr,
            );
        });
    });

    describe('updateSelfRoles', () => {
        const req = {
            user: { id: meIdStr } as JWTPayload,
        } as Request;

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
            const selfRoleId = new Types.ObjectId().toHexString();
            const keptRoleId = new Types.ObjectId().toHexString();
            const updatedMember = {
                _id: new Types.ObjectId(),
                snowflakeId: '1000000000000000004',
                userId: meId,
                serverId,
                roles: [keptRoleId, selfRoleId],
                onboardingRequired: true,
                rulesAcceptedAt: new Date(),
                onboardingCompletedAt: new Date(),
                hiddenChannelIds: [new Types.ObjectId().toHexString()],
                hiddenCategoryIds: [new Types.ObjectId().toHexString()],
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
                    _id: new Types.ObjectId(),
                    snowflakeId: selfRoleId,
                    serverId,
                    name: 'News',
                    managed: false,
                },
                {
                    _id: new Types.ObjectId(),
                    snowflakeId: keptRoleId,
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
                    roleIds: [selfRoleId],
                },
            );

            expect(mockServerMemberRepo.updateRoles).toHaveBeenCalledWith(
                serverIdStr,
                meIdStr,
                expect.arrayContaining([keptRoleId, selfRoleId]),
            );
            expect(mockWsServer.broadcastToServer).toHaveBeenCalledWith(
                serverIdStr,
                {
                    type: 'member_updated',
                    payload: {
                        serverId: serverIdStr,
                        userId: meIdStr,
                        member: mapPublicServerMember(updatedMember as any),
                    },
                },
            );
            expect(result).toEqual(mapServerMemberToDTO(updatedMember as any));
        });
    });

    describe('kickMember', () => {
        const req = {
            user: { id: meIdStr } as JWTPayload,
        } as Request;
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
                serverIdStr,
                targetIdStr,
            );
            expect(mockPingService.clearServerPings).toHaveBeenCalledWith(
                targetIdStr,
                serverIdStr,
            );
        });
    });

    describe('banMember', () => {
        const req = {
            user: { id: meIdStr } as JWTPayload,
        } as Request;
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
                serverIdStr,
                targetIdStr,
            );
            expect(mockPingService.clearServerPings).toHaveBeenCalledWith(
                targetIdStr,
                serverIdStr,
            );
        });
    });

    describe('addMemberRole', () => {
        const req = {
            user: { id: meIdStr } as JWTPayload,
        } as Request;
        const targetId = new Types.ObjectId();
        const targetIdStr = targetId.toHexString();
        const roleId = new Types.ObjectId();
        const roleIdStr = roleId.toHexString();

        it('should throw ForbiddenException if actor lacks manageRoles permission', async () => {
            mockPermissionService.hasPermission.mockResolvedValueOnce(false);

            await expect(
                controller.addMemberRole(
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
                controller.addMemberRole(
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
                roles: [],
            });
            mockRoleRepo.findById.mockResolvedValueOnce(null);

            await expect(
                controller.addMemberRole(
                    serverIdStr,
                    targetIdStr,
                    roleIdStr,
                    req.user?.id as string,
                ),
            ).rejects.toThrow('Role not found');
        });

        it('should throw BadRequestException if trying to add @everyone role', async () => {
            mockPermissionService.hasPermission.mockResolvedValueOnce(true);
            mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
                userId: targetId,
                roles: [],
            });
            mockRoleRepo.findById.mockResolvedValueOnce({
                _id: roleId,
                serverId: serverIdStr,
                name: '@everyone',
            });

            await expect(
                controller.addMemberRole(
                    serverIdStr,
                    targetIdStr,
                    roleIdStr,
                    req.user?.id as string,
                ),
            ).rejects.toThrow(
                'Cannot manually assign @everyone role to a member',
            );

            expect(mockServerMemberRepo.addRole).not.toHaveBeenCalled();
        });

        it('should throw ForbiddenException if role is managed (symmetric with removeMemberRole)', async () => {
            mockPermissionService.hasPermission.mockResolvedValueOnce(true);
            mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
                userId: targetId,
                roles: [],
            });
            mockRoleRepo.findById.mockResolvedValueOnce({
                _id: roleId,
                serverId: serverIdStr,
                name: 'Managed Bot Role',
                managed: true,
            });

            await expect(
                controller.addMemberRole(
                    serverIdStr,
                    targetIdStr,
                    roleIdStr,
                    req.user?.id as string,
                ),
            ).rejects.toThrow(
                'Cannot manually assign a managed role to a member',
            );

            expect(mockServerMemberRepo.addRole).not.toHaveBeenCalled();
        });

        it('should throw ForbiddenException if user is not owner and has equal/lower role than the target member', async () => {
            mockPermissionService.hasPermission.mockResolvedValueOnce(true);
            mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
                userId: targetId,
                roles: [],
            });
            mockRoleRepo.findById.mockResolvedValueOnce({
                _id: roleId,
                serverId: serverIdStr,
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
                controller.addMemberRole(
                    serverIdStr,
                    targetIdStr,
                    roleIdStr,
                    req.user?.id as string,
                ),
            ).rejects.toThrow(
                'You cannot manage roles for a member with a role equal to or higher than your own',
            );
        });

        it('should throw ForbiddenException if user is not owner and role position is higher or equal to actor highest role', async () => {
            mockPermissionService.hasPermission.mockResolvedValueOnce(true);
            mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
                userId: targetId,
                roles: [],
            });
            mockRoleRepo.findById.mockResolvedValueOnce({
                _id: roleId,
                serverId: serverIdStr,
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
                controller.addMemberRole(
                    serverIdStr,
                    targetIdStr,
                    roleIdStr,
                    req.user?.id as string,
                ),
            ).rejects.toThrow(
                'You cannot assign a role equal to or higher than your own highest role',
            );
        });

        it('should successfully add role if actor is the server owner', async () => {
            mockPermissionService.hasPermission.mockResolvedValueOnce(true);
            mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
                userId: targetId,
                roles: [],
            });
            mockRoleRepo.findById.mockResolvedValueOnce({
                _id: roleId,
                serverId: serverIdStr,
                name: 'Mod Role',
                position: 10,
            });
            mockServerRepo.findById.mockResolvedValueOnce({
                ownerId: meId,
            });

            const mockUpdatedMember = {
                userId: targetId,
                roles: [roleIdStr],
            };
            mockServerMemberRepo.addRole.mockResolvedValueOnce(
                mockUpdatedMember,
            );

            const result = await controller.addMemberRole(
                serverIdStr,
                targetIdStr,
                roleIdStr,
                req.user?.id as string,
            );

            expect(mockServerMemberRepo.addRole).toHaveBeenCalledWith(
                serverIdStr,
                targetIdStr,
                roleIdStr,
            );
            expect(result).toEqual(mockUpdatedMember);
        });
    });

    describe('removeMemberRole', () => {
        const req = {
            user: { id: meIdStr } as JWTPayload,
        } as Request;
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
                serverId: serverIdStr,
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
                serverId: serverIdStr,
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
                serverId: serverIdStr,
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
                serverId: serverIdStr,
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
                serverId: serverIdStr,
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
                serverIdStr,
                targetIdStr,
                roleIdStr,
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
                serverId: serverIdStr,
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
                serverIdStr,
                targetIdStr,
                roleIdStr,
            );
            expect(result).toEqual(mockUpdatedMember);
        });
    });

    describe('banMember with deleteMessageDuration', () => {
        const req = {
            user: { id: meIdStr } as JWTPayload,
        } as Request;
        const targetId = new Types.ObjectId();
        const targetIdStr = targetId.toHexString();

        beforeEach(() => {
            mockPermissionService.hasPermission.mockResolvedValue(true);
            mockServerRepo.findById.mockResolvedValue({
                _id: serverId,
                ownerId: meId,
            });
            mockPermissionService.getHighestRolePosition.mockResolvedValueOnce(
                10,
            );
            mockPermissionService.getHighestRolePosition.mockResolvedValueOnce(
                5,
            );
            mockChannelRepo.findByServerId.mockResolvedValue([
                { snowflakeId: 'ch1' },
                { snowflakeId: 'ch2' },
            ]);
        });

        it('does not delete messages when deleteMessageDuration is omitted', async () => {
            await controller.banMember(serverIdStr, req.user?.id as string, {
                userId: targetIdStr,
                reason: 'test',
            });

            expect(
                mockMessageRepo.softDeleteByAuthorAfter,
            ).not.toHaveBeenCalled();
        });

        it('soft-deletes messages from the last 24h when duration is 24h', async () => {
            mockMessageRepo.softDeleteByAuthorAfter.mockResolvedValue(5);

            await controller.banMember(serverIdStr, req.user?.id as string, {
                userId: targetIdStr,
                reason: 'spam',
                deleteMessageDuration: '24h',
            });

            expect(
                mockMessageRepo.softDeleteByAuthorAfter,
            ).toHaveBeenCalledTimes(1);
            const [argServerId, argUserId, argAfter] =
                mockMessageRepo.softDeleteByAuthorAfter.mock.calls[0];
            expect(argServerId).toBe(serverIdStr);
            expect(argUserId).toBe(targetIdStr);
            expect(argAfter).toBeInstanceOf(Date);
            const hoursDiff =
                (Date.now() - argAfter.getTime()) / (1000 * 60 * 60);
            expect(hoursDiff).toBeCloseTo(24, 0);
        });

        it('soft-deletes all messages when duration is all', async () => {
            mockMessageRepo.softDeleteByAuthorAfter.mockResolvedValue(12);

            await controller.banMember(serverIdStr, req.user?.id as string, {
                userId: targetIdStr,
                deleteMessageDuration: 'all',
            });

            const [, , argAfter] =
                mockMessageRepo.softDeleteByAuthorAfter.mock.calls[0];
            expect(argAfter.getTime()).toBe(0);
        });

        it('broadcasts bulk delete by author when messages are deleted', async () => {
            mockMessageRepo.softDeleteByAuthorAfter.mockResolvedValue(3);

            await controller.banMember(serverIdStr, req.user?.id as string, {
                userId: targetIdStr,
                deleteMessageDuration: '1h',
            });

            const broadcasts = mockWsServer.broadcastToServer.mock.calls;
            const deleteBroadcasts = broadcasts.filter(
                (c) => c[1]?.type === 'messages_server_bulk_deleted_by_author',
            );
            expect(deleteBroadcasts).toHaveLength(1);
            expect(deleteBroadcasts[0][1].payload).toEqual({
                senderId: targetIdStr,
                serverId: serverIdStr,
                after: expect.any(String),
            });
        });

        it('does not broadcast when no messages are deleted', async () => {
            mockMessageRepo.softDeleteByAuthorAfter.mockResolvedValue(0);

            await controller.banMember(serverIdStr, req.user?.id as string, {
                userId: targetIdStr,
                deleteMessageDuration: '12h',
            });

            const broadcasts = mockWsServer.broadcastToServer.mock.calls;
            const deleteBroadcasts = broadcasts.filter(
                (c) => c[1]?.type === 'messages_server_bulk_deleted_by_author',
            );
            expect(deleteBroadcasts).toHaveLength(0);
        });

        it('still bans and removes the member even if message deletion is requested', async () => {
            mockMessageRepo.softDeleteByAuthorAfter.mockResolvedValue(2);

            await controller.banMember(serverIdStr, req.user?.id as string, {
                userId: targetIdStr,
                deleteMessageDuration: '6h',
            });

            expect(mockServerBanRepo.create).toHaveBeenCalled();
            expect(mockServerMemberRepo.remove).toHaveBeenCalledWith(
                serverIdStr,
                targetIdStr,
            );
        });

        it('still bans and removes the member when message deletion throws', async () => {
            mockMessageRepo.softDeleteByAuthorAfter.mockRejectedValue(
                new Error('db timeout'),
            );

            await controller.banMember(serverIdStr, req.user?.id as string, {
                userId: targetIdStr,
                deleteMessageDuration: 'all',
            });

            expect(mockServerBanRepo.create).toHaveBeenCalled();
            expect(mockServerMemberRepo.remove).toHaveBeenCalledWith(
                serverIdStr,
                targetIdStr,
            );
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to delete messages after ban:',
                expect.any(Error),
            );
        });

        it('removes the member before attempting message deletion', async () => {
            const callOrder: string[] = [];
            mockServerMemberRepo.remove.mockImplementationOnce(async () => {
                callOrder.push('remove');
            });
            mockMessageRepo.softDeleteByAuthorAfter.mockImplementationOnce(
                async () => {
                    callOrder.push('softDeleteByAuthorAfter');
                    return 1;
                },
            );

            await controller.banMember(serverIdStr, req.user?.id as string, {
                userId: targetIdStr,
                deleteMessageDuration: '1h',
            });

            expect(callOrder).toEqual(['remove', 'softDeleteByAuthorAfter']);
        });

        it('still bans when messageRepo is not injected', async () => {
            const controllerNoMsgRepo = new ServerMemberController(
                mockServerMemberRepo as any,
                mockServerRepo as any,
                mockUserRepo as any,
                mockRoleRepo as any,
                mockServerBanRepo as any,
                mockPermissionService as any,
                mockLogger as any,
                mockWsServer as any,
                mockServerAuditLogService,
                mockBlockRepo as any,
                mockPingService as any,
                mockChannelRepo as any,
                mockCategoryRepo as any,
            );

            mockPermissionService.hasPermission.mockResolvedValue(true);
            mockServerRepo.findById.mockResolvedValue({
                _id: serverId,
                ownerId: meId,
            });
            mockPermissionService.getHighestRolePosition.mockResolvedValueOnce(
                10,
            );
            mockPermissionService.getHighestRolePosition.mockResolvedValueOnce(
                5,
            );

            await controllerNoMsgRepo.banMember(
                serverIdStr,
                req.user?.id as string,
                {
                    userId: targetIdStr,
                    deleteMessageDuration: '24h',
                },
            );

            expect(mockServerBanRepo.create).toHaveBeenCalled();
            expect(mockServerMemberRepo.remove).toHaveBeenCalled();
        });
    });
});
