import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

import { AuthGuard } from '../auth.module';
import { PERMISSIONS_KEY } from '../permissions.decorator';
import { resolveSession } from '@/utils/sessionAuth';

jest.mock('@/utils/sessionAuth', () => ({
    resolveSession: jest.fn(),
}));

const mockResolveSession = resolveSession as jest.Mock;

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

describe('AuthGuard', () => {
    let mockUserRepo: { findById: jest.Mock };
    let mockBanRepo: {
        checkExpired: jest.Mock;
        findActiveByUserId: jest.Mock;
    };
    let mockReflector: { getAllAndOverride: jest.Mock };
    let guard: AuthGuard;

    beforeEach(() => {
        jest.clearAllMocks();
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
        guard = new AuthGuard(
            mockUserRepo as never,
            mockBanRepo as never,
            mockReflector as never,
        );
    });

    it('refuses a token that does not resolve to a session', async () => {
        mockResolveSession.mockResolvedValue(null);

        const context = makeContext('not-a-real-token');

        await expect(guard.canActivate(context as never)).rejects.toThrow(
            UnauthorizedException,
        );
    });

    it('denies a user who lacks the required permission and does not have adminAccess', async () => {
        mockResolveSession.mockResolvedValue({
            userId: 'user-1',
            sessionId: 'session-1',
        });
        mockUserRepo.findById.mockResolvedValue({
            snowflakeId: 'user-1',
            permissions: { adminAccess: false, manageBots: false },
        });

        const context = makeContext('token');

        await expect(guard.canActivate(context as never)).rejects.toThrow(
            ForbiddenException,
        );
    });

    it('allows a user who has the specific required permission', async () => {
        mockResolveSession.mockResolvedValue({
            userId: 'user-1',
            sessionId: 'session-1',
        });
        mockUserRepo.findById.mockResolvedValue({
            snowflakeId: 'user-1',
            permissions: { adminAccess: false, manageBots: true },
        });

        const context = makeContext('token');

        await expect(guard.canActivate(context as never)).resolves.toBe(true);
    });

    it('allows a user with adminAccess even when the specific permission is false, since adminAccess is documented as a super-admin bypass', async () => {
        mockResolveSession.mockResolvedValue({
            userId: 'user-1',
            sessionId: 'session-1',
        });
        mockUserRepo.findById.mockResolvedValue({
            snowflakeId: 'user-1',
            permissions: { adminAccess: true, manageBots: false },
        });

        const context = makeContext('token');

        await expect(guard.canActivate(context as never)).resolves.toBe(true);
    });

    it('still denies a user with no permissions object at all, even without any explicit adminAccess flag', async () => {
        mockResolveSession.mockResolvedValue({
            userId: 'user-1',
            sessionId: 'session-1',
        });
        mockUserRepo.findById.mockResolvedValue({
            snowflakeId: 'user-1',
            permissions: undefined,
        });

        const context = makeContext('token');

        await expect(guard.canActivate(context as never)).rejects.toThrow(
            ForbiddenException,
        );
    });
});
