import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { AdminInviteController } from '../AdminInviteController';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type { IBanRepository } from '@/di/interfaces/IBanRepository';
import * as jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/config/env';

describe('AdminInviteController Security', () => {
    let guard: JwtAuthGuard;
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
        guard = new JwtAuthGuard(
            mockUserRepo as unknown as IUserRepository,
            mockBanRepo as unknown as IBanRepository,
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
            getHandler: () =>
                (
                    AdminInviteController.prototype as unknown as Record<
                        string,
                        unknown
                    >
                )[method],
            getClass: () => AdminInviteController,
            switchToHttp: () => ({
                getRequest: () => req,
            }),
        } as unknown as ExecutionContext;
    };

    it('denies access to createInvite if user lacks manageInvites permission', async () => {
        const userId = new Types.ObjectId();
        const token = jwt.sign(
            { id: userId.toHexString(), tokenVersion: 0, type: 'access' },
            JWT_SECRET,
        );

        mockUserRepo.findById.mockResolvedValue({
            _id: userId,
            tokenVersion: 0,
            permissions: {},
        });
        mockBanRepo.findActiveByUserId.mockResolvedValue(null);

        const context = createMockContext('createInvite', token);

        await expect(guard.canActivate(context)).rejects.toThrow(
            ForbiddenException,
        );
    });

    it('allows access to createInvite if user has manageInvites permission', async () => {
        const userId = new Types.ObjectId();
        const token = jwt.sign(
            { id: userId.toHexString(), tokenVersion: 0, type: 'access' },
            JWT_SECRET,
        );

        mockUserRepo.findById.mockResolvedValue({
            _id: userId,
            tokenVersion: 0,
            permissions: { manageInvites: true },
        });
        mockBanRepo.findActiveByUserId.mockResolvedValue(null);

        const context = createMockContext('createInvite', token);

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
