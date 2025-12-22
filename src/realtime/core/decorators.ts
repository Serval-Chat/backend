import 'reflect-metadata';
import type { ZodSchema } from 'zod';

export const GATEWAY_METADATA = Symbol('GATEWAY_METADATA');
export const EVENT_METADATA = Symbol('EVENT_METADATA');
export const MIDDLEWARE_METADATA = Symbol('MIDDLEWARE_METADATA');

/**
 * Gateway Class Decorator.
 *
 * Marks a class as a WebSocket gateway.
 *
 * @param namespace - The namespace for this gateway (default: '/').
 */
export function Gateway(namespace: string = '/'): ClassDecorator {
    return (target) => {
        Reflect.defineMetadata(GATEWAY_METADATA, { namespace }, target);
    };
}

/**
 * Event Handler Decorator.
 *
 * Marks a method as a handler for a specific WebSocket event.
 *
 * @param event - The event name to listen for.
 * @param schema - Optional Zod schema for payload validation.
 */
export function On(event: string, schema?: ZodSchema): MethodDecorator {
    return (target, propertyKey, descriptor) => {
        const events =
            Reflect.getMetadata(EVENT_METADATA, target.constructor) || [];
        events.push({ event, schema, method: propertyKey });
        Reflect.defineMetadata(EVENT_METADATA, events, target.constructor);
    };
}

/**
 * Middleware Decorator.
 *
 * Applies middleware to a specific event handler.
 *
 * @param middleware - The middleware function to apply.
 */
export function UseMiddleware(middleware: Function): MethodDecorator {
    return (target, propertyKey, descriptor) => {
        const middlewares =
            Reflect.getMetadata(MIDDLEWARE_METADATA, target.constructor) || [];
        middlewares.push({ middleware, method: propertyKey });
        Reflect.defineMetadata(
            MIDDLEWARE_METADATA,
            middlewares,
            target.constructor,
        );
    };
}
