import { WsDispatcher } from '../dispatcher';
import { websocketMessagesCounter } from '@/utils/metrics';

const logger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
};

const redisService = {
    getClient: jest.fn(),
    getSubscriber: jest.fn(),
};

function envelope(type: string) {
    return {
        id: 'envelope-1',
        event: { type, payload: {} },
        meta: {},
    } as never;
}

async function labelsFor(event: string): Promise<number> {
    const metric = await websocketMessagesCounter.get();
    return metric.values
        .filter((v) => v.labels.event === event)
        .reduce((total, v) => total + v.value, 0);
}

describe('WsDispatcher unknown event handling', () => {
    let dispatcher: WsDispatcher;

    beforeEach(() => {
        jest.clearAllMocks();
        websocketMessagesCounter.reset();
        dispatcher = new WsDispatcher(logger, redisService as never);
    });

    afterEach(() => {
        dispatcher.destroy();
    });

    it('reports no handler for an unregistered event', () => {
        expect(dispatcher.hasHandler('definitely_not_registered')).toBe(false);
    });

    it('buckets unregistered event names under a single label', async () => {
        for (let i = 0; i < 25; i++) {
            await dispatcher.dispatch({} as never, envelope(`attack_${i}`));
        }

        expect(await labelsFor('unknown')).toBe(25);

        const metric = await websocketMessagesCounter.get();
        const attackerLabels = metric.values.filter((v) =>
            String(v.labels.event).startsWith('attack_'),
        );
        expect(attackerLabels).toHaveLength(0);
    });

    it('logs an unknown event at debug, not warn', async () => {
        await dispatcher.dispatch({} as never, envelope('nope'));

        expect(logger.warn).not.toHaveBeenCalled();
        expect(logger.debug).toHaveBeenCalledWith(
            expect.stringContaining('No handler for event: nope'),
        );
    });

    it('truncates a long event name in the log line', async () => {
        await dispatcher.dispatch({} as never, envelope('e'.repeat(5000)));

        const line = String(logger.debug.mock.calls[0]?.[0]);
        expect(line).toContain('e'.repeat(32));
        expect(line).not.toContain('e'.repeat(33));
    });

    it('strips control characters so log lines cannot be forged', async () => {
        await dispatcher.dispatch(
            {} as never,
            envelope('a\n2026-01-01 [info]: forged entry'),
        );

        const line = String(logger.debug.mock.calls[0]?.[0]);
        expect(line).not.toContain('\n');
        expect(line).not.toContain('forged entry');
    });
});
