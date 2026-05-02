import { ServerRoleController } from '../ServerRoleController';
import { Types } from 'mongoose';
import type { Request } from 'express';
import type { IRoleRepository } from '@/di/interfaces/IRoleRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IServerRepository } from '@/di/interfaces/IServerRepository';
import type { PermissionService } from '@/permissions/PermissionService';
import type { ILogger } from '@/di/interfaces/ILogger';
import type { WsServer } from '@/ws/server';
import type { IAuditLogRepository } from '@/di/interfaces/IAuditLogRepository';
import type { IServerAuditLogService } from '@/di/interfaces/IServerAuditLogService';
import type { ImageDeliveryService } from '@/services/ImageDeliveryService';
import type { UpdateRoleRequestDTO, ReorderRolesRequestDTO } from '../dto/server-role.request.dto';

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
    } as unknown as IRoleRepository;
    
    const mockServerMemberRepo = {
        findByServerAndUser: jest.fn(),
    } as unknown as IServerMemberRepository;
    
    const mockServerRepo = {
        findById: jest.fn().mockResolvedValue({ ownerId: new Types.ObjectId() }),
    } as unknown as IServerRepository;
    
    const mockPermissionService = {
        hasPermission: jest.fn().mockResolvedValue(true),
        invalidateCache: jest.fn(),
        getHighestRolePosition: jest.fn().mockResolvedValue(100),
    } as unknown as PermissionService;
    
    const mockLogger = {
        error: jest.fn(),
    } as unknown as ILogger;
    
    const mockWsServer = {
        broadcastToServer: jest.fn(),
    } as unknown as WsServer;
    
    const mockAuditLogRepo = {} as unknown as IAuditLogRepository;
    
    const mockServerAuditLogService = {
        createAndBroadcast: jest.fn(),
    } as unknown as IServerAuditLogService;
    
    const mockImageDeliveryService = {} as unknown as ImageDeliveryService;

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
            mockImageDeliveryService
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
                serverId: SERVER_ID,
                name: 'Test Role',
                glowEnabled: true,
            };

            (mockRoleRepo.findById as jest.Mock).mockResolvedValue(existingRole);
            (mockRoleRepo.update as jest.Mock).mockResolvedValue({ ...existingRole, glowEnabled: false });

            const req = {
                user: { id: USER_ID.toHexString() },
            } as unknown as Request;

            const body = {
                glowEnabled: false,
            };

            const result = await controller.updateRole(SERVER_ID.toHexString(), ROLE_ID.toHexString(), req, body as unknown as UpdateRoleRequestDTO);

            expect(mockRoleRepo.update).toHaveBeenCalledWith(
                ROLE_ID,
                expect.objectContaining({ glowEnabled: false })
            );
            expect(result.glowEnabled).toBe(false);
        });
    });

    describe('reorderRoles', () => {
        it('should ensure NO roles Reodered event occur when trying to reorder normal role and @everyone role with no valid role updates', async () => {
            const SERVER_ID = new Types.ObjectId().toHexString();
            const USER_ID = new Types.ObjectId().toHexString();
            const EVERYONE_ROLE_ID = new Types.ObjectId().toHexString();

            (mockRoleRepo.findEveryoneRole as jest.Mock).mockResolvedValue({ _id: new Types.ObjectId(EVERYONE_ROLE_ID), name: '@everyone' });
            (mockRoleRepo.findByServerId as jest.Mock).mockResolvedValue([
                { _id: new Types.ObjectId(EVERYONE_ROLE_ID), name: '@everyone', position: 0 }
            ]);

            const req = {
                user: { id: USER_ID },
            } as unknown as Request;

            const body = {
                rolePositions: [
                    { roleId: EVERYONE_ROLE_ID, position: 1 }
                ]
            };

            await controller.reorderRoles(SERVER_ID, req, body as unknown as ReorderRolesRequestDTO);

            expect(mockWsServer.broadcastToServer).not.toHaveBeenCalled();
            expect(mockServerAuditLogService.createAndBroadcast).not.toHaveBeenCalled();
        });
    });
});
