import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ProfileController } from '@/controllers/ProfileController';
import { resolveBotAuthPayload } from '@/utils/botAuth';
import { JwtAuthGuard } from '../auth.module';

jest.mock('@/utils/botAuth', () => ({ resolveBotAuthPayload: jest.fn() }));

const resolveBot = resolveBotAuthPayload as jest.Mock;

const BOT_PAYLOAD = {
    type: 'access',
    id: 'bot-user-1',
    login: 'bot.client-1',
    username: 'somebot',
    tokenVersion: 0,
    isBot: true,
};

const BOT_TOKEN = 'raw-bot-token';

function contextFor(handler: unknown) {
    const request: Record<string, unknown> = {
        headers: { authorization: `Bearer ${BOT_TOKEN}` },
    };
    return {
        request,
        context: {
            getHandler: () => handler,
            getClass: () => ProfileController,
            switchToHttp: () => ({ getRequest: () => request }),
        },
    };
}

describe('bot tokens against permission-guarded routes', () => {
    let guard: JwtAuthGuard;

    beforeEach(() => {
        jest.clearAllMocks();
        resolveBot.mockResolvedValue(BOT_PAYLOAD);
        guard = new JwtAuthGuard(
            { findById: jest.fn() } as never,
            {
                checkExpired: jest.fn(),
                findActiveByUserId: jest.fn(),
            } as never,
            new Reflector(),
        );
    });

    it('rejects a bot on a route that requires an admin permission', async () => {
        const { context } = contextFor(
            ProfileController.prototype.updateUserBadges,
        );

        await expect(guard.canActivate(context as never)).rejects.toThrow(
            ForbiddenException,
        );
    });

    it('still admits a bot on a route with no permission requirement', async () => {
        const { context, request } = contextFor(
            ProfileController.prototype.getMyProfile,
        );

        await expect(guard.canActivate(context as never)).resolves.toBe(true);
        expect(request.user).toEqual(BOT_PAYLOAD);
    });

    it('rejects a bot whose token no longer resolves, for example after a ban', async () => {
        resolveBot.mockResolvedValue(null);
        const { context } = contextFor(
            ProfileController.prototype.getMyProfile,
        );

        await expect(guard.canActivate(context as never)).rejects.toThrow(
            'Invalid token',
        );
    });
});
