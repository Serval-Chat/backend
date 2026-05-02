import { ForbiddenException } from '@nestjs/common';

import { IsHumanGuard } from '../bot.guard';

describe('IsHumanGuard', () => {
    const guard = new IsHumanGuard();

    it('throws for bot users', () => {
        const context = {
            switchToHttp: () => ({
                getRequest: () => ({ user: { id: 'u1', isBot: true } }),
            }),
        } as never;

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('allows non-bot users', () => {
        const context = {
            switchToHttp: () => ({
                getRequest: () => ({ user: { id: 'u2', isBot: false } }),
            }),
        } as never;

        expect(guard.canActivate(context)).toBe(true);
    });
});
