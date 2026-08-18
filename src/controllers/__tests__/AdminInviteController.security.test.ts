/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import { AuthGuard } from '@/modules/auth/auth.module';
import { AdminInviteController } from '../AdminInviteController';
import { resolveSession } from '@/utils/sessionAuth';

jest.mock('@/utils/sessionAuth', () => ({
    resolveSession: jest.fn(),
}));

const mockResolveSession = resolveSession as jest.Mock;

describe('AdminInviteController Security', () => {
    let guard: AuthGuard;
    let reflector: Reflector;
    const mockUserRepo = {
        findById: jest.fn(),
    };
    const mockBanRepo = {
        checkExpired: jest.fn(),
        findActiveByUserId: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        reflector = new Reflector();
        guard = new AuthGuard(
            mockUserRepo as any,
            mockBanRepo as any,
            reflector,
        );
    });

    const createMockContext = (
        method: string,
        token?: string,
    ): ExecutionContext => {
        const req = {
            headers:
                token !== undefined ? { authorization: `Bearer ${token}` } : {},
            user: undefined,
        };
        return {
            getHandler: () => (AdminInviteController.prototype as any)[method],
            getClass: () => AdminInviteController,
            switchToHttp: () => ({
                getRequest: () => req,
            }),
        } as ExecutionContext;
    };

    it('denies access to createInvite if user lacks manageInvites permission', async () => {
        const userId = new Types.ObjectId();
        mockResolveSession.mockResolvedValue({
            userId: userId.toHexString(),
            sessionId: 'session-1',
        });

        mockUserRepo.findById.mockResolvedValue({
            _id: userId,
            permissions: {},
        });
        mockBanRepo.findActiveByUserId.mockResolvedValue(null);

        const context = createMockContext('createInvite', 'token');

        await expect(guard.canActivate(context)).rejects.toThrow(
            ForbiddenException,
        );
    });

    it('allows access to createInvite if user has manageInvites permission', async () => {
        const userId = new Types.ObjectId();
        mockResolveSession.mockResolvedValue({
            userId: userId.toHexString(),
            sessionId: 'session-1',
        });

        mockUserRepo.findById.mockResolvedValue({
            _id: userId,
            permissions: { manageInvites: true },
        });
        mockBanRepo.findActiveByUserId.mockResolvedValue(null);

        const context = createMockContext('createInvite', 'token');

        const result = await guard.canActivate(context);
        expect(result).toBe(true);
    });

    it('denies access if no token is provided', async () => {
        const context = createMockContext('createInvite');
        await expect(guard.canActivate(context)).rejects.toThrow(
            UnauthorizedException,
        );
    });
});
