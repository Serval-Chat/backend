import {
    WS_RATE_LIMIT_METADATA,
    WS_VALIDATE_METADATA,
    WS_NEED_AUTH_METADATA,
} from '@/ws/decorators';
import { PingController } from '../PingController';

const target = PingController.prototype;

describe('ping decorators', () => {
    it('validates its payload', () => {
        expect(
            Reflect.getMetadata(WS_VALIDATE_METADATA, target, 'onPing'),
        ).toBeDefined();
    });

    it('carries a rate limit, which @Dedup does not provide', () => {
        // Dedup only suppresses a repeated envelope id, and clients mint a new
        // uuid per message, so it never limited this handler.
        const limit = Reflect.getMetadata(
            WS_RATE_LIMIT_METADATA,
            target,
            'onPing',
        );

        expect(limit).toEqual({ points: 4, duration: 1000 });
    });

    it('still requires authentication', () => {
        expect(
            Reflect.getMetadata(WS_NEED_AUTH_METADATA, target, 'onPing'),
        ).toBe(true);
    });
});
