import { RequestMethod, type MiddlewareConsumer } from '@nestjs/common';

import { AppModule } from '@/app.module';
import { loginBackoff } from '@/middleware/loginBackoff';
import {
    embedProxyLimiter,
    loginLimiter,
    registrationLimiter,
    twoFactorVerifyLimiter,
    passwordResetConfirmLimiter,
    botTokenLimiter,
    sensitiveOperationLimiter,
} from '@/middleware/rateLimiting';

interface Route {
    path: string;
    method: RequestMethod;
}

function collectBindings(): Map<unknown, Route[]> {
    const bindings = new Map<unknown, Route[]>();

    const consumer: MiddlewareConsumer = {
        apply(...middleware: unknown[]) {
            return {
                forRoutes(...routes: unknown[]) {
                    for (const fn of middleware) {
                        const existing = bindings.get(fn) ?? [];
                        bindings.set(fn, [...existing, ...(routes as Route[])]);
                    }
                    return consumer;
                },
                exclude() {
                    return this;
                },
            };
        },
    };

    new AppModule().configure(consumer);
    return bindings;
}

describe('rate limiter route bindings', () => {
    const bindings = collectBindings();

    const paths = (limiter: unknown) =>
        (bindings.get(limiter) ?? []).map((r) => r.path);

    it.each([
        ['login', loginLimiter, 'api/v1/auth/login'],
        ['registration', registrationLimiter, 'api/v1/auth/register'],
        ['2FA verify', twoFactorVerifyLimiter, 'api/v1/auth/2fa/verify'],
        [
            'password reset confirm',
            passwordResetConfirmLimiter,
            'api/v1/auth/password/reset/confirm',
        ],
        ['bot token', botTokenLimiter, 'api/v1/bots'],
    ])('the %s limiter is bound to %s', (_name, limiter, path) => {
        expect(paths(limiter)).toContain(path);
    });

    it('binds the embed proxy limiter to both proxy routes, GET only', () => {
        const routes = bindings.get(embedProxyLimiter) ?? [];

        expect(routes.map((r) => r.path).sort()).toEqual([
            'api/v1/embed/proxy',
            'api/v1/embed/proxy-image',
        ]);
        for (const route of routes) {
            expect(route.method).toBe(RequestMethod.GET);
        }
    });

    it('binds the login backoff alongside the login limiter', () => {
        expect(paths(loginBackoff)).toEqual(['api/v1/auth/login']);
    });

    it('leaves no limiter declared but unbound', () => {
        for (const limiter of [
            loginLimiter,
            registrationLimiter,
            sensitiveOperationLimiter,
            twoFactorVerifyLimiter,
            passwordResetConfirmLimiter,
            botTokenLimiter,
            embedProxyLimiter,
        ]) {
            expect(bindings.get(limiter) ?? []).not.toHaveLength(0);
        }
    });
});
