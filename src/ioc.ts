/**
 * TSOA IoC Container Bridge.
 *
 * This file provides the bridge between TSOA (which handles routing and OpenAPI)
 * and InversifyJS (our primary dependency injection container).
 */
import { container } from '@/di/container';
import type { IocContainer, ServiceIdentifier } from '@tsoa/runtime';

export const iocContainer: IocContainer = {
    get: <T>(controller: ServiceIdentifier<T>): T => {
        return container.get<T>(controller as any);
    },
};
