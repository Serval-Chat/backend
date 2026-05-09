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

describe('ServerMemberController', () => {
    const meId = new Types.ObjectId();
    const serverId = new Types.ObjectId();
    const meIdStr = meId.toHexString();
    const serverIdStr = serverId.toHexString();

    const mockServerMemberRepo = {
        findByServerAndUser: jest.fn(),
        remove: jest.fn(),
    };
    const mockServerRepo = {
        findById: jest.fn(),
    };
    const mockUserRepo = {
        findById: jest.fn(),
    };
    const mockRoleRepo = {
        findById: jest.fn(),
    };
    const mockServerBanRepo = {
        create: jest.fn(),
    };
    const mockPermissionService = {
        invalidateCache: jest.fn(),
        hasPermission: jest.fn(),
        getHighestRolePosition: jest.fn(),
    };
    const mockLogger = {
        error: jest.fn(),
        warn: jest.fn(),
    };
    const mockWsServer = {
        broadcastToServer: jest.fn(),
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

    let controller: ServerMemberController;

    beforeEach(() => {
        jest.clearAllMocks();
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
        );
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

            await controller.leaveServer(serverIdStr, req);

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

            await controller.kickMember(serverIdStr, targetIdStr, req, {
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

            await controller.banMember(serverIdStr, req, {
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
});
