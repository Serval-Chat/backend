import type { WebSocket } from 'ws';

import { BACKPRESSURE_THRESHOLD_BYTES, send, sendToMany } from '../broadcast';

function fakeSocket(overrides: Partial<WebSocket> = {}): WebSocket {
    return {
        readyState: 1,
        OPEN: 1,
        bufferedAmount: 0,
        send: jest.fn((_msg: string, cb?: (err?: Error) => void) => cb?.()),
        terminate: jest.fn(),
        ...overrides,
    } as unknown as WebSocket;
}

const EVENT = { type: 'x', payload: {} } as never;

describe('send', () => {
    it('delivers to a socket with nothing queued', () => {
        const ws = fakeSocket();

        send(ws, EVENT);

        expect(ws.send).toHaveBeenCalledTimes(1);
    });

    it('terminates a socket over the backpressure threshold instead of sending', () => {
        const ws = fakeSocket({
            bufferedAmount: BACKPRESSURE_THRESHOLD_BYTES + 1,
        });

        send(ws, EVENT);

        expect(ws.terminate).toHaveBeenCalledTimes(1);
        expect(ws.send).not.toHaveBeenCalled();
    });

    it('delivers exactly at the threshold, only terminates past it', () => {
        const atThreshold = fakeSocket({
            bufferedAmount: BACKPRESSURE_THRESHOLD_BYTES,
        });

        send(atThreshold, EVENT);

        expect(atThreshold.send).toHaveBeenCalledTimes(1);
        expect(atThreshold.terminate).not.toHaveBeenCalled();
    });

    it('does not try to terminate a socket that is already closed', () => {
        const ws = fakeSocket({
            readyState: 3,
            bufferedAmount: BACKPRESSURE_THRESHOLD_BYTES + 1,
        });

        send(ws, EVENT);

        expect(ws.terminate).not.toHaveBeenCalled();
        expect(ws.send).not.toHaveBeenCalled();
    });
});

describe('sendToMany', () => {
    it('drops only the backed-up sockets, delivers to the rest', () => {
        const healthy = fakeSocket();
        const stuck = fakeSocket({
            bufferedAmount: BACKPRESSURE_THRESHOLD_BYTES + 1,
        });

        sendToMany([healthy, stuck], EVENT);

        expect(healthy.send).toHaveBeenCalledTimes(1);
        expect(stuck.send).not.toHaveBeenCalled();
        expect(stuck.terminate).toHaveBeenCalledTimes(1);
        expect(healthy.terminate).not.toHaveBeenCalled();
    });

    it('one stuck socket in a broadcast does not affect the others', () => {
        const sockets = Array.from({ length: 5 }, (_, i) =>
            fakeSocket({
                bufferedAmount: i === 2 ? BACKPRESSURE_THRESHOLD_BYTES + 1 : 0,
            }),
        );

        sendToMany(sockets, EVENT);

        const sent = sockets.filter(
            (ws) => (ws.send as jest.Mock).mock.calls.length > 0,
        );
        const terminated = sockets.filter(
            (ws) => (ws.terminate as jest.Mock).mock.calls.length > 0,
        );

        expect(sent).toHaveLength(4);
        expect(terminated).toHaveLength(1);
    });
});
