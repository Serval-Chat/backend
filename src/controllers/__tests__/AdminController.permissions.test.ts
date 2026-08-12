import { NotFoundException } from '@nestjs/common';
import { DEFAULT_PERMISSIONS } from '@/permissions/AdminPermissions';
import { AdminController } from '../AdminController';

const DEPS = [
    'userRepo',
    'auditLogRepo',
    'friendshipRepo',
    'wsServer',
    'logger',
    'banRepo',
    'muteRepo',
    'serverRepo',
    'messageRepo',
    'serverMessageRepo',
    'warningRepo',
    'serverMemberRepo',
    'channelRepo',
    'inviteRepo',
    'adminNoteRepo',
    'serverVerificationService',
    'discoveryService',
] as const;

function makeController(overrides: Partial<Record<string, unknown>>) {
    const args = DEPS.map((name) => overrides[name] ?? {});
    return new (
        AdminController as unknown as new (
            ...args: unknown[]
        ) => AdminController
    )(...args);
}

const TARGET = 'target-user';
const CALLER = 'caller-admin';

function userRepoWith(updateResult: boolean) {
    return {
        findById: jest.fn(async (id: string) =>
            id === CALLER
                ? {
                      snowflakeId: CALLER,
                      permissions: {
                          ...DEFAULT_PERMISSIONS,
                          adminAccess: true,
                      },
                  }
                : {
                      snowflakeId: TARGET,
                      permissions: { ...DEFAULT_PERMISSIONS },
                  },
        ),
        updatePermissions: jest.fn().mockResolvedValue(updateResult),
        incrementTokenVersion: jest.fn().mockResolvedValue(undefined),
    };
}

const request = { user: { id: CALLER, username: 'admin' }, ip: '127.0.0.1' };
const body = { permissions: { ...DEFAULT_PERMISSIONS, manageUsers: true } };

describe('updateUserPermissions', () => {
    it('revokes outstanding tokens after a permission change', async () => {
        const userRepo = userRepoWith(true);
        const controller = makeController({
            userRepo,
            auditLogRepo: { create: jest.fn().mockResolvedValue(undefined) },
            logger: {
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                debug: jest.fn(),
            },
        });

        await controller.updateUserPermissions(TARGET, body, request as never);

        expect(userRepo.updatePermissions).toHaveBeenCalledWith(
            TARGET,
            body.permissions,
        );
        expect(userRepo.incrementTokenVersion).toHaveBeenCalledWith(TARGET);
    });

    it('reports a write that matched nothing instead of claiming success', async () => {
        const userRepo = userRepoWith(false);
        const auditLogRepo = { create: jest.fn().mockResolvedValue(undefined) };
        const controller = makeController({
            userRepo,
            auditLogRepo,
            logger: {
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                debug: jest.fn(),
            },
        });

        await expect(
            controller.updateUserPermissions(
                TARGET,
                body as never,
                request as never,
            ),
        ).rejects.toThrow(NotFoundException);

        expect(userRepo.incrementTokenVersion).not.toHaveBeenCalled();
        expect(auditLogRepo.create).not.toHaveBeenCalled();
    });
});
