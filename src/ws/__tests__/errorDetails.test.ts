import { z } from 'zod';
import type { WebSocket } from 'ws';

import { WsDispatcher } from '../dispatcher';
import { ApiError } from '@/utils/ApiError';

interface SentError {
    code: string;
    details: { message: string; data?: unknown };
}

function harness() {
    const frames: string[] = [];
    const ws = {
        readyState: 1,
        OPEN: 1,
        send: (raw: string) => frames.push(raw),
    } as unknown as WebSocket;

    const dispatcher = new WsDispatcher(
        {
            error: jest.fn(),
            warn: jest.fn(),
            info: jest.fn(),
            debug: jest.fn(),
        },
        { getClient: () => ({}) } as never,
    );

    const send = (code: string, message: string, details?: unknown) => {
        frames.length = 0;
        (
            dispatcher as unknown as {
                sendError: (
                    ws: WebSocket,
                    envelope: unknown,
                    code: string,
                    message: string,
                    details?: unknown,
                ) => void;
            }
        ).sendError(
            ws,
            { id: 'req-1', event: { type: 'x', payload: {} }, meta: { ts: 0 } },
            code,
            message,
            details,
        );

        const envelope = JSON.parse(frames[0] as string) as {
            event: { type: string; payload: SentError };
        };
        expect(envelope.event.type).toBe('error');
        return envelope.event.payload;
    };

    return { send };
}

describe('the error details envelope, as it goes on the wire', () => {
    it('never lets extra data replace the message', () => {
        const { send } = harness();

        const payload = send('BAD_REQUEST', 'the real message', {
            message: 'an impostor',
        });

        expect(payload.details.message).toBe('the real message');
        expect(payload.details.data).toEqual({ message: 'an impostor' });
    });

    it('carries Zod issues under a named key, not positional ones', () => {
        const { send } = harness();
        const result = z.object({ a: z.string() }).safeParse({ a: 1 });

        const payload = send('MALFORMED_MESSAGE', 'Validation failed', {
            issues: result.success ? [] : result.error.issues,
        });

        const data = payload.details.data as { issues: unknown[] };
        expect(Array.isArray(data.issues)).toBe(true);
        expect(data.issues.length).toBeGreaterThan(0);
        expect(Object.keys(payload.details).sort()).toEqual([
            'data',
            'message',
        ]);
        expect(payload.details).not.toHaveProperty('0');
    });

    it('omits data entirely when there is none', () => {
        const { send } = harness();

        const payload = send('INTERNAL_ERROR', 'something broke');

        expect(payload.details).toEqual({ message: 'something broke' });
    });

    it('keeps an ApiError payload intact instead of flattening it', () => {
        const { send } = harness();
        const err = new ApiError(403, 'nope', { permission: 'manageBots' });

        const payload = send('FORBIDDEN', err.message, err.details);

        expect(payload.details.message).toBe('nope');
        expect(payload.details.data).toEqual({ permission: 'manageBots' });
    });

    it('does not turn an array into numeric keys', () => {
        const { send } = harness();

        const payload = send('BAD_REQUEST', 'listy', ['one', 'two']);

        expect(payload.details.data).toEqual(['one', 'two']);
        expect(payload.details).not.toHaveProperty('0');
        expect(payload.details).not.toHaveProperty('1');
    });

    it('leaves details.message where the shipped client reads it', () => {
        const { send } = harness();

        const payload = send('FORBIDDEN', 'Not a member of this server');

        expect(payload.details?.message).toBe('Not a member of this server');
    });
});
