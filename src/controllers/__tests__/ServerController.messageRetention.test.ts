import { GUARDS_METADATA } from '@nestjs/common/constants';
import { IsHumanGuard } from '@/modules/auth/bot.guard';
import { ServerController } from '../ServerController';

describe('ServerController deleted message retention setting', () => {
    const serverId = '1234567890123456789';
    const userId = '2234567890123456789';
    const serverRepo = {
        findById: jest.fn(),
        update: jest.fn(),
    };
    const messageRepo = {
        hardDeleteDeletedByServerId: jest.fn(),
    };
    const permissionService = {
        hasPermission: jest.fn().mockResolvedValue(true),
        invalidateCache: jest.fn(),
        requirePermission: jest.fn(async function (
            this: { hasPermission: (...args: unknown[]) => Promise<boolean> },
            id: string,
            actorId: string,
            permission: string,
            error: Error,
        ) {
            if (!(await this.hasPermission(id, actorId, permission))) {
                throw error;
            }
        }),
    };
    const wsServer = { broadcastToServer: jest.fn() };
    const auditLogService = { createAndBroadcast: jest.fn() };
    const discoveryService = { refreshServer: jest.fn() };
    const controller = new ServerController(
        serverRepo as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        messageRepo as never,
        {} as never,
        {} as never,
        permissionService as never,
        wsServer as never,
        {} as never,
        {} as never,
        {} as never,
        auditLogService,
        {} as never,
        discoveryService as never,
    );

    it('marks the deleted-message flush endpoint as human-only', () => {
        const guards =
            Reflect.getMetadata(
                GUARDS_METADATA,
                ServerController.prototype.flushDeletedMessages,
            ) ?? [];

        expect(guards).toContain(IsHumanGuard);
    });

    beforeEach(() => {
        jest.clearAllMocks();
        permissionService.hasPermission.mockResolvedValue(true);
        serverRepo.findById.mockResolvedValue({
            id: serverId,
            name: 'Test server',
            ownerId: userId,
            deletedMessageRetentionMinutes: 4320,
        });
        serverRepo.update.mockImplementation(
            async (_id, updates: Record<string, unknown>) => ({
                id: serverId,
                name: 'Test server',
                ownerId: userId,
                ...updates,
            }),
        );
        messageRepo.hardDeleteDeletedByServerId.mockResolvedValue(0);
        discoveryService.refreshServer.mockResolvedValue(undefined);
    });

    it('stores the setting and records the change in the server audit log', async () => {
        await controller.updateServer(serverId, userId, {
            deletedMessageRetentionMinutes: 20,
        });

        expect(serverRepo.update).toHaveBeenCalledWith(serverId, {
            deletedMessageRetentionMinutes: 20,
        });
        expect(auditLogService.createAndBroadcast).toHaveBeenCalledWith(
            expect.objectContaining({
                serverId,
                actorId: userId,
                changes: [
                    {
                        field: 'deletedMessageRetentionMinutes',
                        before: 4320,
                        after: 20,
                    },
                ],
            }),
        );
        expect(wsServer.broadcastToServer).toHaveBeenCalledWith(
            serverId,
            expect.objectContaining({
                type: 'server_updated',
                payload: expect.objectContaining({
                    server: expect.objectContaining({
                        deletedMessageRetentionMinutes: 20,
                    }),
                }),
            }),
        );
    });

    it('sanitizes direct controller input to the supported bounds', async () => {
        await controller.updateServer(serverId, userId, {
            deletedMessageRetentionMinutes: -100,
        });

        expect(serverRepo.update).toHaveBeenCalledWith(serverId, {
            deletedMessageRetentionMinutes: 5,
        });
    });

    it('flushes deleted messages, broadcasts the cache invalidation, and audits the count', async () => {
        messageRepo.hardDeleteDeletedByServerId.mockResolvedValue(7);

        await expect(
            controller.flushDeletedMessages(serverId, userId),
        ).resolves.toEqual({
            message: 'Deleted messages flushed',
            deletedCount: 7,
        });

        expect(permissionService.requirePermission).toHaveBeenCalledWith(
            serverId,
            userId,
            'manageServer',
            expect.any(Error),
        );
        expect(messageRepo.hardDeleteDeletedByServerId).toHaveBeenCalledWith(
            serverId,
        );
        expect(wsServer.broadcastToServer).toHaveBeenCalledWith(serverId, {
            type: 'server_deleted_messages_flushed',
            payload: { serverId },
        });
        expect(auditLogService.createAndBroadcast).toHaveBeenCalledWith({
            serverId,
            actorId: userId,
            actionType: 'flush_deleted_messages',
            targetId: serverId,
            targetType: 'server',
            metadata: { deletedCount: 7 },
        });
    });

    it('does not broadcast or audit when no deleted messages exist', async () => {
        await controller.flushDeletedMessages(serverId, userId);

        expect(wsServer.broadcastToServer).not.toHaveBeenCalled();
        expect(auditLogService.createAndBroadcast).not.toHaveBeenCalled();
    });

    it('requires manageServer to flush deleted messages', async () => {
        permissionService.hasPermission.mockResolvedValue(false);

        await expect(
            controller.flushDeletedMessages(serverId, userId),
        ).rejects.toThrow();

        expect(messageRepo.hardDeleteDeletedByServerId).not.toHaveBeenCalled();
    });
});
