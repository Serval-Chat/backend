/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';

import { VanityLinkController } from '../VanityLinkController';
import { ErrorMessages } from '@/constants/errorMessages';

describe('VanityLinkController', () => {
    let controller: VanityLinkController;

    const mockVanityLinkRepo = {
        findByServerId: jest.fn(),
        findByCode: jest.fn(),
        setForServer: jest.fn(),
        deleteByServerId: jest.fn(),
    } as any;

    const mockInviteRepo = {
        findByCode: jest.fn(),
    } as any;

    const mockServerRepo = {
        findById: jest.fn(),
    } as any;

    const mockPermissionService = {
        requirePermission: jest.fn(),
    } as any;

    const mockWsServer = {
        broadcastToServer: jest.fn(),
    } as any;

    const mockServerAuditLogService = {
        createAndBroadcast: jest.fn(),
    } as any;

    const mockUserRepo = {
        findById: jest.fn(),
    } as any;

    const mockDiscoveryService = {
        refreshServer: jest.fn(),
    } as any;

    const SERVER_ID = 'server1';
    const OWNER_ID = 'owner1';
    const OTHER_USER_ID = 'other1';

    beforeEach(() => {
        jest.clearAllMocks();
        mockPermissionService.requirePermission.mockResolvedValue(undefined);
        mockServerRepo.findById.mockResolvedValue({ ownerId: OWNER_ID });
        controller = new VanityLinkController(
            mockVanityLinkRepo,
            mockInviteRepo,
            mockServerRepo,
            mockPermissionService,
            mockWsServer,
            mockServerAuditLogService,
            mockUserRepo,
            mockDiscoveryService,
        );
    });

    describe('getVanityLink', () => {
        it('throws when the caller lacks manageInvites', async () => {
            mockPermissionService.requirePermission.mockRejectedValue(
                new ForbiddenException(
                    ErrorMessages.VANITY_LINK.NO_PERMISSION_MANAGE,
                ),
            );

            await expect(
                controller.getVanityLink(SERVER_ID, OTHER_USER_ID),
            ).rejects.toThrow(ForbiddenException);
        });

        it('returns { code: null } when no vanity link is set, without hitting user repo', async () => {
            mockVanityLinkRepo.findByServerId.mockResolvedValue(null);

            const result = await controller.getVanityLink(SERVER_ID, OWNER_ID);

            expect(result).toEqual({ code: null });
            expect(mockUserRepo.findById).not.toHaveBeenCalled();
        });

        it('returns the vanity link with creator username when set', async () => {
            mockVanityLinkRepo.findByServerId.mockResolvedValue({
                code: 'myserver',
                createdByUserId: OWNER_ID,
                createdAt: new Date('2026-01-01'),
            });
            mockUserRepo.findById.mockResolvedValue({ username: 'Alice' });

            const result = await controller.getVanityLink(SERVER_ID, OWNER_ID);

            expect(result).toEqual({
                code: 'myserver',
                createdByUserId: OWNER_ID,
                createdByUsername: 'Alice',
                createdAt: new Date('2026-01-01'),
            });
        });
    });

    describe('setVanityLink', () => {
        it('rejects a non-owner even if they have manageInvites', async () => {
            await expect(
                controller.setVanityLink(SERVER_ID, OTHER_USER_ID, 'other', {
                    code: 'myserver',
                }),
            ).rejects.toThrow(ForbiddenException);

            expect(mockVanityLinkRepo.setForServer).not.toHaveBeenCalled();
        });

        it('rejects when the server does not exist', async () => {
            mockServerRepo.findById.mockResolvedValue(null);

            await expect(
                controller.setVanityLink(SERVER_ID, OWNER_ID, 'owner', {
                    code: 'myserver',
                }),
            ).rejects.toThrow(ForbiddenException);
        });

        it("rejects a code already taken by another server's vanity link", async () => {
            mockVanityLinkRepo.findByCode.mockResolvedValue({
                serverId: 'someOtherServer',
                code: 'taken',
            });

            await expect(
                controller.setVanityLink(SERVER_ID, OWNER_ID, 'owner', {
                    code: 'taken',
                }),
            ).rejects.toThrow(BadRequestException);

            expect(mockVanityLinkRepo.setForServer).not.toHaveBeenCalled();
        });

        it('allows re-setting the same code already owned by this server', async () => {
            mockVanityLinkRepo.findByCode.mockResolvedValue({
                serverId: SERVER_ID,
                code: 'myserver',
            });
            mockInviteRepo.findByCode.mockResolvedValue(null);
            mockVanityLinkRepo.setForServer.mockResolvedValue({
                snowflakeId: 'v1',
                code: 'myserver',
                createdByUserId: OWNER_ID,
                createdAt: new Date('2026-01-01'),
            });

            await expect(
                controller.setVanityLink(SERVER_ID, OWNER_ID, 'owner', {
                    code: 'myserver',
                }),
            ).resolves.toBeDefined();

            expect(mockVanityLinkRepo.setForServer).toHaveBeenCalledWith(
                SERVER_ID,
                'myserver',
                OWNER_ID,
            );
        });

        it('rejects a code already taken by a plain invite', async () => {
            mockVanityLinkRepo.findByCode.mockResolvedValue(null);
            mockInviteRepo.findByCode.mockResolvedValue({ code: 'taken' });

            await expect(
                controller.setVanityLink(SERVER_ID, OWNER_ID, 'owner', {
                    code: 'taken',
                }),
            ).rejects.toThrow(BadRequestException);

            expect(mockVanityLinkRepo.setForServer).not.toHaveBeenCalled();
        });

        it('converts a duplicate-key error from the repo write into a BadRequestException', async () => {
            mockVanityLinkRepo.findByCode.mockResolvedValue(null);
            mockInviteRepo.findByCode.mockResolvedValue(null);
            mockVanityLinkRepo.setForServer.mockRejectedValue({ code: 11000 });

            await expect(
                controller.setVanityLink(SERVER_ID, OWNER_ID, 'owner', {
                    code: 'myserver',
                }),
            ).rejects.toThrow(BadRequestException);
        });

        it('rethrows a non-duplicate-key error from the repo write', async () => {
            mockVanityLinkRepo.findByCode.mockResolvedValue(null);
            mockInviteRepo.findByCode.mockResolvedValue(null);
            const unexpected = new Error('db down');
            mockVanityLinkRepo.setForServer.mockRejectedValue(unexpected);

            await expect(
                controller.setVanityLink(SERVER_ID, OWNER_ID, 'owner', {
                    code: 'myserver',
                }),
            ).rejects.toThrow('db down');
        });

        it('sets the link, audit-logs, broadcasts, and refreshes discovery on success', async () => {
            mockVanityLinkRepo.findByCode.mockResolvedValue(null);
            mockInviteRepo.findByCode.mockResolvedValue(null);
            mockVanityLinkRepo.setForServer.mockResolvedValue({
                snowflakeId: 'v1',
                code: 'myserver',
                createdByUserId: OWNER_ID,
                createdAt: new Date('2026-01-01'),
            });

            const result = await controller.setVanityLink(
                SERVER_ID,
                OWNER_ID,
                'owner',
                { code: 'myserver' },
            );

            expect(result).toEqual({
                code: 'myserver',
                createdByUserId: OWNER_ID,
                createdByUsername: 'owner',
                createdAt: new Date('2026-01-01'),
            });
            expect(
                mockServerAuditLogService.createAndBroadcast,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    serverId: SERVER_ID,
                    actorId: OWNER_ID,
                    actionType: 'vanity_link_set',
                    targetId: 'v1',
                }),
            );
            expect(mockWsServer.broadcastToServer).toHaveBeenCalledWith(
                SERVER_ID,
                expect.objectContaining({ type: 'server_vanity_link_set' }),
            );
            expect(mockDiscoveryService.refreshServer).toHaveBeenCalledWith(
                SERVER_ID,
            );
        });
    });

    describe('deleteVanityLink', () => {
        it('rejects a non-owner', async () => {
            await expect(
                controller.deleteVanityLink(SERVER_ID, OTHER_USER_ID),
            ).rejects.toThrow(ForbiddenException);

            expect(mockVanityLinkRepo.deleteByServerId).not.toHaveBeenCalled();
        });

        it('throws NotFoundException when no vanity link exists', async () => {
            mockVanityLinkRepo.findByServerId.mockResolvedValue(null);

            await expect(
                controller.deleteVanityLink(SERVER_ID, OWNER_ID),
            ).rejects.toThrow(NotFoundException);

            expect(mockVanityLinkRepo.deleteByServerId).not.toHaveBeenCalled();
        });

        it('deletes, audit-logs, broadcasts, and refreshes discovery on success', async () => {
            mockVanityLinkRepo.findByServerId.mockResolvedValue({
                snowflakeId: 'v1',
                code: 'myserver',
            });

            const result = await controller.deleteVanityLink(
                SERVER_ID,
                OWNER_ID,
            );

            expect(result).toEqual({ message: 'Vanity link deleted' });
            expect(mockVanityLinkRepo.deleteByServerId).toHaveBeenCalledWith(
                SERVER_ID,
            );
            expect(
                mockServerAuditLogService.createAndBroadcast,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    serverId: SERVER_ID,
                    actorId: OWNER_ID,
                    actionType: 'vanity_link_delete',
                    targetId: 'v1',
                }),
            );
            expect(mockWsServer.broadcastToServer).toHaveBeenCalledWith(
                SERVER_ID,
                expect.objectContaining({ type: 'server_vanity_link_deleted' }),
            );
            expect(mockDiscoveryService.refreshServer).toHaveBeenCalledWith(
                SERVER_ID,
            );
        });
    });
});
