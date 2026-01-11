import 'reflect-metadata';
import type { ZodSchema } from 'zod';
import type { AnyMessageWsEvent } from '@/ws/protocol/envelope';

export const WS_CONTROLLER_METADATA = Symbol('WS_CONTROLLER_METADATA');
export const WS_EVENT_METADATA = Symbol('WS_EVENT_METADATA');
export const WS_NEED_AUTH_METADATA = Symbol('WS_NEED_AUTH_METADATA');
export const WS_DEDUP_METADATA = Symbol('WS_DEDUP_METADATA');
export const WS_RATE_LIMIT_METADATA = Symbol('WS_RATE_LIMIT_METADATA');
export const WS_VALIDATE_METADATA = Symbol('WS_VALIDATE_METADATA');
export const WS_CACHE_METADATA = Symbol('WS_CACHE_METADATA');
export const WS_BEFORE_METADATA = Symbol('WS_BEFORE_METADATA');
export const WS_AFTER_METADATA = Symbol('WS_AFTER_METADATA');
export const WS_ON_ERROR_METADATA = Symbol('WS_ON_ERROR_METADATA');
export const WS_TIMEOUT_METADATA = Symbol('WS_TIMEOUT_METADATA');

export type AnyWsEventType = AnyMessageWsEvent['type'];
/**
 * Marks a class as a WebSocket controller.
 */
export function WsController(): ClassDecorator {
    return (target) => {
        Reflect.defineMetadata(WS_CONTROLLER_METADATA, true, target);
    };
}

/**
 * Marks a method as an event handler for a specific WebSocket event type.
 * @param type The event type to handle.
 */
export function Event(type: AnyWsEventType): MethodDecorator {
    return (target, propertyKey) => {
        const events =
            Reflect.getMetadata(WS_EVENT_METADATA, target.constructor) || [];
        events.push({ type, method: propertyKey });
        Reflect.defineMetadata(WS_EVENT_METADATA, events, target.constructor);
    };
}

/**
 * Marks a method as requiring authentication.
 */
export function NeedAuth(): MethodDecorator {
    return (target, propertyKey) => {
        Reflect.defineMetadata(
            WS_NEED_AUTH_METADATA,
            true,
            target,
            propertyKey,
        );
    };
}

/**
 * Marks a method as requiring deduplication.
 */
export function Dedup(): MethodDecorator {
    return (target, propertyKey) => {
        Reflect.defineMetadata(WS_DEDUP_METADATA, true, target, propertyKey);
    };
}

/**
 * Applies rate limiting to an event handler.
 * @param points Maximum number of events allowed.
 * @param duration Duration in seconds.
 */
export function RateLimit(points: number, duration: number): MethodDecorator {
    return (target, propertyKey) => {
        Reflect.defineMetadata(
            WS_RATE_LIMIT_METADATA,
            { points, duration },
            target,
            propertyKey,
        );
    };
}

/**
 * Validates the event payload using a Zod schema.
 * @param schema The Zod schema to validate against.
 */
export function Validate(schema: ZodSchema): MethodDecorator {
    return (target, propertyKey) => {
        Reflect.defineMetadata(
            WS_VALIDATE_METADATA,
            schema,
            target,
            propertyKey,
        );
    };
}

/**
 * Caches the response of an event handler.
 * @param ttl Time to live in seconds.
 */
export function Cache(ttl: number): MethodDecorator {
    return (target, propertyKey) => {
        Reflect.defineMetadata(WS_CACHE_METADATA, { ttl }, target, propertyKey);
    };
}

/**
 * Runs a hook before the event handler.
 * @param hook Function name or function to run.
 */
export function Before(hook: Function): MethodDecorator {
    return (target, propertyKey) => {
        const hooks =
            Reflect.getMetadata(WS_BEFORE_METADATA, target, propertyKey) || [];
        hooks.push(hook);
        Reflect.defineMetadata(WS_BEFORE_METADATA, hooks, target, propertyKey);
    };
}

/**
 * Runs a hook after the event handler.
 * @param hook Function name or function to run.
 */
export function After(hook: Function): MethodDecorator {
    return (target, propertyKey) => {
        const hooks =
            Reflect.getMetadata(WS_AFTER_METADATA, target, propertyKey) || [];
        hooks.push(hook);
        Reflect.defineMetadata(WS_AFTER_METADATA, hooks, target, propertyKey);
    };
}

/**
 * Runs a hook when an error occurs in the event handler.
 * @param hook Function name or function to run.
 */
export function OnError(hook: Function): MethodDecorator {
    return (target, propertyKey) => {
        const hooks =
            Reflect.getMetadata(WS_ON_ERROR_METADATA, target, propertyKey) ||
            [];
        hooks.push(hook);
        Reflect.defineMetadata(
            WS_ON_ERROR_METADATA,
            hooks,
            target,
            propertyKey,
        );
    };
}

/**
 * Automatically cancels the request and returns an error if it takes too long.
 * @param ms Timeout in milliseconds.
 */
export function Timeout(ms: number): MethodDecorator {
    return (target, propertyKey) => {
        Reflect.defineMetadata(WS_TIMEOUT_METADATA, ms, target, propertyKey);
    };
}
