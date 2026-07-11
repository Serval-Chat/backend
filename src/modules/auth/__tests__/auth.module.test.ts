import { ForbiddenException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

import { JWT_SECRET } from '@/config/env';
import { JwtAuthGuard } from '../auth.module';
import { PERMISSIONS_KEY } from '../permissions.decorator';

function signToken(overrides: Record<string, unknown> = {}): string {
    return jwt.sign(
        {
            id: 'user-1',
            login: 'testuser',
            username: 'testuser',
            tokenVersion: 0,
            ...overrides,
        },
        JWT_SECRET,
        { algorithm: 'HS256' },
    );
}

function makeContext(token: string): {
    getHandler: () => object;
    getClass: () => object;
    switchToHttp: () => { getRequest: () => Record<string, unknown> };
} {
    const request: Record<string, unknown> = {
        headers: { authorization: `Bearer ${token}` },
    };
    return {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({ getRequest: () => request }),
    };
}

describe('JwtAuthGuard', () => {
    let mockUserRepo: { findById: jest.Mock };
    let mockBanRepo: {
        checkExpired: jest.Mock;
        findActiveByUserId: jest.Mock;
    };
    let mockReflector: { getAllAndOverride: jest.Mock };
    let guard: JwtAuthGuard;

    beforeEach(() => {
        mockUserRepo = { findById: jest.fn() };
        mockBanRepo = {
            checkExpired: jest.fn().mockResolvedValue(undefined),
            findActiveByUserId: jest.fn().mockResolvedValue(null),
        };
        mockReflector = {
            getAllAndOverride: jest.fn((key: string) => {
                if (key === 'isPublic') return false;
                if (key === PERMISSIONS_KEY) return ['manageBots'];
                return undefined;
            }),
        };
        guard = new JwtAuthGuard(
            mockUserRepo as never,
            mockBanRepo as never,
            mockReflector as never,
        );
    });

    it('denies a user who lacks the required permission and does not have adminAccess', async () => {
        mockUserRepo.findById.mockResolvedValue({
            snowflakeId: 'user-1',
            tokenVersion: 0,
            permissions: { adminAccess: false, manageBots: false },
        });

        const context = makeContext(signToken());

        await expect(guard.canActivate(context as never)).rejects.toThrow(
            ForbiddenException,
        );
    });

    it('allows a user who has the specific required permission', async () => {
        mockUserRepo.findById.mockResolvedValue({
            snowflakeId: 'user-1',
            tokenVersion: 0,
            permissions: { adminAccess: false, manageBots: true },
        });

        const context = makeContext(signToken());

        await expect(guard.canActivate(context as never)).resolves.toBe(true);
    });

    it('allows a user with adminAccess even when the specific permission is false, since adminAccess is documented as a super-admin bypass', async () => {
        mockUserRepo.findById.mockResolvedValue({
            snowflakeId: 'user-1',
            tokenVersion: 0,
            permissions: { adminAccess: true, manageBots: false },
        });

        const context = makeContext(signToken());

        await expect(guard.canActivate(context as never)).resolves.toBe(true);
    });

    it('still denies a user with no permissions object at all, even without any explicit adminAccess flag', async () => {
        mockUserRepo.findById.mockResolvedValue({
            snowflakeId: 'user-1',
            tokenVersion: 0,
            permissions: undefined,
        });

        const context = makeContext(signToken());

        await expect(guard.canActivate(context as never)).rejects.toThrow(
            ForbiddenException,
        );
    });
});
