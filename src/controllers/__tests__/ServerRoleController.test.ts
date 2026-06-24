/* eslint-disable @typescript-eslint/no-explicit-any */
import { ServerRoleController } from '../ServerRoleController';
import { Types } from 'mongoose';
import type { Request } from 'express';

describe('ServerRoleController', () => {
    let controller: ServerRoleController;

    const mockRoleRepo = {
        findEveryoneRole: jest.fn(),
        findByServerId: jest.fn(),
        update: jest.fn(),
        findMaxPositionByServerId: jest.fn(),
        create: jest.fn(),
        findById: jest.fn(),
        delete: jest.fn(),
    } as any;

    const mockServerMemberRepo = {
        findByServerAndUser: jest.fn(),
    } as any;

    const mockServerRepo = {
        findById: jest
            .fn()
            .mockResolvedValue({ ownerId: new Types.ObjectId() }),
    } as any;

    const mockPermissionService = {
        hasPermission: jest.fn().mockResolvedValue(true),
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
        getHighestRolePosition: jest.fn().mockResolvedValue(100),
    } as any;

    const mockLogger = {
        error: jest.fn(),
    } as any;

    const mockWsServer = {
        broadcastToServer: jest.fn(),
    } as any;

    const mockAuditLogRepo = {} as any;

    const mockServerAuditLogService = {
        createAndBroadcast: jest.fn(),
    } as any;

    const mockImageDeliveryService = {} as any;

    beforeEach(() => {
        controller = new ServerRoleController(
            mockRoleRepo,
            mockServerRepo,
            mockServerMemberRepo,
            mockPermissionService,
            mockLogger,
            mockWsServer,
            mockAuditLogRepo,
            mockServerAuditLogService,
            mockImageDeliveryService,
        );
        jest.clearAllMocks();
    });

    describe('updateRole', () => {
        it('should allow enabling/disabling role glow', async () => {
            const SERVER_ID = new Types.ObjectId();
            const ROLE_ID = new Types.ObjectId();
            const USER_ID = new Types.ObjectId();

            const existingRole = {
                _id: ROLE_ID,
                serverId: SERVER_ID.toHexString(),
                name: 'Test Role',
                glowEnabled: true,
            };

            (mockRoleRepo.findById as jest.Mock).mockResolvedValue(
                existingRole,
            );
            (mockRoleRepo.update as jest.Mock).mockResolvedValue({
                ...existingRole,
                glowEnabled: false,
            });

            const req = {
                user: { id: USER_ID.toHexString() },
            } as Request;

            const body = {
                glowEnabled: false,
            };

            const result = await controller.updateRole(
                SERVER_ID.toHexString(),
                ROLE_ID.toHexString(),
                req.user?.id as string,
                body,
            );

            expect(mockRoleRepo.update).toHaveBeenCalledWith(
                ROLE_ID.toHexString(),
                expect.objectContaining({ glowEnabled: false }),
            );
            expect(result.glowEnabled).toBe(false);
        });
    });

    describe('reorderRoles', () => {
        it('should ensure NO roles Reodered event occur when trying to reorder normal role and @everyone role with no valid role updates', async () => {
            const SERVER_ID = new Types.ObjectId().toHexString();
            const USER_ID = new Types.ObjectId().toHexString();
            const EVERYONE_ROLE_ID = new Types.ObjectId().toHexString();

            (mockRoleRepo.findEveryoneRole as jest.Mock).mockResolvedValue({
                _id: new Types.ObjectId(),
                snowflakeId: EVERYONE_ROLE_ID,
                name: '@everyone',
            });
            (mockRoleRepo.findByServerId as jest.Mock).mockResolvedValue([
                {
                    _id: new Types.ObjectId(),
                    snowflakeId: EVERYONE_ROLE_ID,
                    name: '@everyone',
                    position: 0,
                },
            ]);

            const req = {
                user: { id: USER_ID },
            } as Request;

            const body = {
                rolePositions: [{ roleId: EVERYONE_ROLE_ID, position: 1 }],
            };

            await controller.reorderRoles(
                SERVER_ID,
                req.user?.id as string,
                body,
            );

            expect(mockWsServer.broadcastToServer).not.toHaveBeenCalled();
            expect(
                mockServerAuditLogService.createAndBroadcast,
            ).not.toHaveBeenCalled();
        });
    });

    describe('deleteRole', () => {
        let SERVER_ID: Types.ObjectId;
        let ROLE_ID: Types.ObjectId;
        let USER_ID: Types.ObjectId;
        let req: Request;

        beforeEach(() => {
            SERVER_ID = new Types.ObjectId();
            ROLE_ID = new Types.ObjectId();
            USER_ID = new Types.ObjectId();
            req = {
                user: { id: USER_ID.toHexString() },
            } as Request;
        });

        it('should throw ForbiddenException if user lacks manageRoles permission', async () => {
            (
                mockPermissionService.hasPermission as jest.Mock
            ).mockResolvedValueOnce(false);

            await expect(
                controller.deleteRole(
                    SERVER_ID.toHexString(),
                    ROLE_ID.toHexString(),
                    req.user?.id as string,
                ),
            ).rejects.toThrow('No permission to manage roles');
        });

        it('should throw BadRequestException if trying to delete @everyone role even if user is the server owner', async () => {
            (
                mockPermissionService.hasPermission as jest.Mock
            ).mockResolvedValueOnce(true);
            (mockRoleRepo.findById as jest.Mock).mockResolvedValueOnce({
                _id: ROLE_ID,
                serverId: SERVER_ID.toHexString(),
                name: '@everyone',
                position: 0,
            });
            (mockServerRepo.findById as jest.Mock).mockResolvedValueOnce({
                ownerId: USER_ID,
            });

            await expect(
                controller.deleteRole(
                    SERVER_ID.toHexString(),
                    ROLE_ID.toHexString(),
                    req.user?.id as string,
                ),
            ).rejects.toThrow('Cannot delete @everyone role');
        });

        it('should throw BadRequestException if trying to delete @everyone role when user has sufficient permissions but is not owner', async () => {
            (
                mockPermissionService.hasPermission as jest.Mock
            ).mockResolvedValueOnce(true);
            (mockRoleRepo.findById as jest.Mock).mockResolvedValueOnce({
                _id: ROLE_ID,
                serverId: SERVER_ID.toHexString(),
                name: '@everyone',
                position: 0,
            });
            (mockServerRepo.findById as jest.Mock).mockResolvedValueOnce({
                ownerId: new Types.ObjectId(),
            });
            (
                mockPermissionService.getHighestRolePosition as jest.Mock
            ).mockResolvedValueOnce(10);

            await expect(
                controller.deleteRole(
                    SERVER_ID.toHexString(),
                    ROLE_ID.toHexString(),
                    req.user?.id as string,
                ),
            ).rejects.toThrow('Cannot delete @everyone role');
        });

        it('should throw ForbiddenException if user is not owner and has a role position lower than or equal to the target role', async () => {
            (
                mockPermissionService.hasPermission as jest.Mock
            ).mockResolvedValueOnce(true);
            (mockRoleRepo.findById as jest.Mock).mockResolvedValueOnce({
                _id: ROLE_ID,
                serverId: SERVER_ID.toHexString(),
                name: 'Mod Role',
                position: 10,
            });
            (mockServerRepo.findById as jest.Mock).mockResolvedValueOnce({
                ownerId: new Types.ObjectId(),
            });
            (
                mockPermissionService.getHighestRolePosition as jest.Mock
            ).mockResolvedValueOnce(10);

            await expect(
                controller.deleteRole(
                    SERVER_ID.toHexString(),
                    ROLE_ID.toHexString(),
                    req.user?.id as string,
                ),
            ).rejects.toThrow(
                'You cannot delete a role equal to or higher than your own highest role',
            );
        });

        it('should delete a non-@everyone role if user is the server owner', async () => {
            (
                mockPermissionService.hasPermission as jest.Mock
            ).mockResolvedValueOnce(true);
            const role = {
                _id: ROLE_ID,
                serverId: SERVER_ID.toHexString(),
                name: 'Mod Role',
                position: 10,
            };
            (mockRoleRepo.findById as jest.Mock).mockResolvedValueOnce(role);
            (mockServerRepo.findById as jest.Mock).mockResolvedValueOnce({
                ownerId: USER_ID,
            });

            const result = await controller.deleteRole(
                SERVER_ID.toHexString(),
                ROLE_ID.toHexString(),
                req.user?.id as string,
            );

            expect(result).toEqual({ message: 'Role deleted' });
            expect(mockRoleRepo.delete).toHaveBeenCalledWith(
                ROLE_ID.toHexString(),
            );
        });

        it('should delete a non-@everyone role if user has manageRoles permission and higher role position', async () => {
            (
                mockPermissionService.hasPermission as jest.Mock
            ).mockResolvedValueOnce(true);
            const role = {
                _id: ROLE_ID,
                serverId: SERVER_ID.toHexString(),
                name: 'Mod Role',
                position: 10,
            };
            (mockRoleRepo.findById as jest.Mock).mockResolvedValueOnce(role);
            (mockServerRepo.findById as jest.Mock).mockResolvedValueOnce({
                ownerId: new Types.ObjectId(),
            });
            (
                mockPermissionService.getHighestRolePosition as jest.Mock
            ).mockResolvedValueOnce(15);

            const result = await controller.deleteRole(
                SERVER_ID.toHexString(),
                ROLE_ID.toHexString(),
                req.user?.id as string,
            );

            expect(result).toEqual({ message: 'Role deleted' });
            expect(mockRoleRepo.delete).toHaveBeenCalledWith(
                ROLE_ID.toHexString(),
            );
        });
    });
});
