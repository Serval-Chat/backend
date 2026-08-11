import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';

import { JWT_SECRET } from '@/config/env';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { PERMISSIONS_KEY } from '@/modules/auth/permissions.decorator';
import { ProfileController } from '../ProfileController';

const handler = ProfileController.prototype.updateUserBadges;

function signToken(permissions?: Record<string, boolean>): string {
    return jwt.sign(
        {
            id: 'admin-1',
            login: 'admin',
            username: 'admin',
            tokenVersion: 0,
            ...(permissions === undefined ? {} : { permissions }),
        },
        JWT_SECRET,
        { algorithm: 'HS256' },
    );
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
    let guard: JwtAuthGuard;

    beforeEach(() => {
        userRepo = { findById: jest.fn() };
        banRepo = {
            checkExpired: jest.fn().mockResolvedValue(undefined),
            findActiveByUserId: jest.fn().mockResolvedValue(null),
        };
        guard = new JwtAuthGuard(
            userRepo as never,
            banRepo as never,
            new Reflector(),
        );
    });

    it('declares manageUsers on the route', () => {
        const required = Reflect.getMetadata(PERMISSIONS_KEY, handler);
        expect(required).toEqual(['manageUsers']);
    });

    it('denies a token that claims manageUsers the database has revoked', async () => {
        userRepo.findById.mockResolvedValue({
            snowflakeId: 'admin-1',
            tokenVersion: 0,
            permissions: { adminAccess: false, manageUsers: false },
        });

        const context = makeContext(signToken({ manageUsers: true }));

        await expect(guard.canActivate(context as never)).rejects.toThrow(
            ForbiddenException,
        );
    });

    it('allows a token with no permissions when the database grants them', async () => {
        userRepo.findById.mockResolvedValue({
            snowflakeId: 'admin-1',
            tokenVersion: 0,
            permissions: { adminAccess: false, manageUsers: true },
        });

        const context = makeContext(signToken());

        await expect(guard.canActivate(context as never)).resolves.toBe(true);
    });

    it('allows adminAccess', async () => {
        userRepo.findById.mockResolvedValue({
            snowflakeId: 'admin-1',
            tokenVersion: 0,
            permissions: { adminAccess: true, manageUsers: false },
        });

        await expect(
            guard.canActivate(makeContext(signToken()) as never),
        ).resolves.toBe(true);
    });
});
