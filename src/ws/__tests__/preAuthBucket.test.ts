import type { WebSocket } from 'ws';

import { WsDispatcher } from '../dispatcher';

function makeDispatcher(): WsDispatcher {
    return new WsDispatcher(
        {
            error: jest.fn(),
            warn: jest.fn(),
            info: jest.fn(),
            debug: jest.fn(),
        },
        { getClient: () => ({}) } as never,
    );
}

const socket = () => ({}) as unknown as WebSocket;

describe('the pre-authentication rate-limit bucket', () => {
    it('keys on the source, so reconnecting does not reset the budget', () => {
        const dispatcher = makeDispatcher();
        const first = socket();
        const second = socket();

        dispatcher.registerConnection(first, '203.0.113.9');
        dispatcher.registerConnection(second, '203.0.113.9');

        expect(dispatcher.getPreAuthKey(first)).toBe('src:203.0.113.9');
        expect(dispatcher.getPreAuthKey(second)).toBe(
            dispatcher.getPreAuthKey(first),
        );
    });

    it('separates distinct sources', () => {
        const dispatcher = makeDispatcher();
        const a = socket();
        const b = socket();

        dispatcher.registerConnection(a, '203.0.113.9');
        dispatcher.registerConnection(b, '198.51.100.7');

        expect(dispatcher.getPreAuthKey(a)).not.toBe(
            dispatcher.getPreAuthKey(b),
        );
    });

    it('falls back to a per-socket bucket when no source is known', () => {
        const dispatcher = makeDispatcher();
        const first = socket();
        const second = socket();

        dispatcher.registerConnection(first);
        dispatcher.registerConnection(second);

        expect(dispatcher.getPreAuthKey(first)).toMatch(/^anon:/);
        expect(dispatcher.getPreAuthKey(second)).not.toBe(
            dispatcher.getPreAuthKey(first),
        );
    });

    it('treats an empty source as unknown rather than one shared bucket', () => {
        const dispatcher = makeDispatcher();
        const ws = socket();

        dispatcher.registerConnection(ws, '');

        expect(dispatcher.getPreAuthKey(ws)).toMatch(/^anon:/);
    });
});
