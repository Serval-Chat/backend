import type { EventType } from './types';

export const EVENT_METADATA = 'ws:event';

export interface EventMetadata {
    event: EventType | string;
    methodName: string;
}

/**
 * Decorator to register a method as a WebSocket event handler.
 * @param event The event type or name to handle.
 */
export function Event(event: EventType | string): MethodDecorator {
    return (target: object, propertyKey: string | symbol) => {
        const metadata: EventMetadata[] =
            Reflect.getMetadata(EVENT_METADATA, target.constructor) || [];
        metadata.push({ event, methodName: propertyKey as string });
        Reflect.defineMetadata(EVENT_METADATA, metadata, target.constructor);
    };
}
