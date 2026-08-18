import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthGuard } from '@/modules/auth/auth.module';
import { PERMISSIONS_KEY } from '@/modules/auth/permissions.decorator';
import { ProfileController } from '../ProfileController';
import { resolveSession } from '@/utils/sessionAuth';

jest.mock('@/utils/sessionAuth', () => ({
    resolveSession: jest.fn(),
}));

const mockResolveSession = resolveSession as jest.Mock;
mockResolveSession.mockResolvedValue({
    userId: 'admin-1',
    sessionId: 'session-1',
});

const handler = ProfileController.prototype.updateUserBadges;

function signToken(): string {
    return 'token';
}

function makeContext(token: string) {
    const request: Record<string, unknown> = {
        headers: { authorization: `Bearer ${token}` },
    };
    return {
        getHandler: () => handler,
        getClass: () => ProfileController,
        switchToHttp: () => ({ getRequest: () => request }),
    };
}

describe('POST /profile/:id/badges permission source', () => {
    let userRepo: { findById: jest.Mock };
    let banRepo: { checkExpired: jest.Mock; findActiveByUserId: jest.Mock };
    let guard: AuthGuard;

    beforeEach(() => {
        userRepo = { findById: jest.fn() };
        banRepo = {
            checkExpired: jest.fn().mockResolvedValue(undefined),
            findActiveByUserId: jest.fn().mockResolvedValue(null),
        };
        guard = new AuthGuard(
            userRepo as never,
            banRepo as never,
            new Reflector(),
        );
    });

    it('declares manageUsers on the route', () => {
        const required = Reflect.getMetadata(PERMISSIONS_KEY, handler);
        expect(required).toEqual(['manageUsers']);
    });

    it('denies when the database does not grant manageUsers', async () => {
        userRepo.findById.mockResolvedValue({
            snowflakeId: 'admin-1',
            permissions: { adminAccess: false, manageUsers: false },
        });

        const context = makeContext(signToken());

        await expect(guard.canActivate(context as never)).rejects.toThrow(
            ForbiddenException,
        );
    });

    it('allows a token with no permissions when the database grants them', async () => {
        userRepo.findById.mockResolvedValue({
            snowflakeId: 'admin-1',
            permissions: { adminAccess: false, manageUsers: true },
        });

        const context = makeContext(signToken());

        await expect(guard.canActivate(context as never)).resolves.toBe(true);
    });

    it('allows adminAccess', async () => {
        userRepo.findById.mockResolvedValue({
            snowflakeId: 'admin-1',
            permissions: { adminAccess: true, manageUsers: false },
        });

        await expect(
            guard.canActivate(makeContext(signToken()) as never),
        ).resolves.toBe(true);
    });
});
