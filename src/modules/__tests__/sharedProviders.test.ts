import { MODULE_METADATA } from '@nestjs/common/constants';
import type { Provider } from '@nestjs/common';

import { container } from '@/di/container';
import { TYPES } from '@/di/types';
import type { IRedisService } from '@/di/interfaces/IRedisService';
import { ServicesModule } from '@/modules/services/services.module';
import { InfrastructureModule } from '@/modules/infrastructure/infrastructure.module';

type TokenProvider = Exclude<Provider, Function> & {
    provide: symbol;
    useFactory?: () => unknown;
};

function providersOf(module: object): TokenProvider[] {
    return (
        Reflect.getMetadata(MODULE_METADATA.PROVIDERS, module) as Provider[]
    ).filter(
        (p): p is TokenProvider =>
            typeof p === 'object' && typeof p.provide === 'symbol',
    );
}

describe('Nest providers shared with the Inversify container', () => {
    afterAll(async () => {
        await container.get<IRedisService>(TYPES.RedisService).quit();
    });

    const modules = { ServicesModule, InfrastructureModule };

    it.each(Object.entries(modules))(
        '%s resolves every Inversify-bound token through the container',
        (_name, module) => {
            const shared = providersOf(module).filter((p) =>
                container.isBound(p.provide),
            );
            expect(shared.length).toBeGreaterThan(0);

            for (const provider of shared) {
                expect({
                    token: provider.provide.toString(),
                    usesFactory: typeof provider.useFactory === 'function',
                }).toEqual({
                    token: provider.provide.toString(),
                    usesFactory: true,
                });
            }
        },
    );

    it.each([
        TYPES.ScraperService,
        TYPES.EmbedService,
        TYPES.ChannelService,
        TYPES.ExportService,
        TYPES.ImageDeliveryService,
        TYPES.PermissionService,
        TYPES.MessageSearchService,
    ])('Nest gets the same %s instance as the WS layer', (token) => {
        const provider = providersOf(ServicesModule).find(
            (p) => p.provide === token,
        );
        expect(provider?.useFactory).toBeDefined();
        expect(provider?.useFactory?.()).toBe(container.get(token));
    });

    it('keeps Nest-only tokens out of the Inversify container', () => {
        expect(container.isBound(TYPES.ServerDiscoveryService)).toBe(false);
    });
});
