import { injectable, inject } from 'inversify';
import { TYPES } from '@/di/types';
import type { ILogger } from '@/di/interfaces/ILogger';
import type { IRedisService } from '@/di/interfaces/IRedisService';
import Redis from 'ioredis';
import { REDIS_URL } from '@/config/env';

@injectable()
export class RedisService implements IRedisService {
    private client: Redis;
    private publisher: Redis;
    private subscriber: Redis;

    constructor(@inject(TYPES.Logger) private logger: ILogger) {
        this.client = new Redis(REDIS_URL, {
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
        });

        this.publisher = this.client.duplicate();
        this.subscriber = new Redis(REDIS_URL, {
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
        });

        this.setupListeners(this.client, 'Main Client');
        this.setupListeners(this.publisher, 'Publisher Client');
        this.setupListeners(this.subscriber, 'Subscriber Client');
    }

    private setupListeners(redisClient: Redis, name: string) {
        redisClient.on('connect', () => {
            this.logger.info(`[RedisService] ${name} connected to Redis`);
        });

        redisClient.on('error', (err) => {
            this.logger.error(`[RedisService] ${name} error:`, err);
        });

        redisClient.on('close', () => {
            this.logger.warn(`[RedisService] ${name} connection closed`);
        });

        redisClient.on('reconnecting', () => {
            this.logger.info(`[RedisService] ${name} reconnecting...`);
        });
    }

    public getClient(): Redis {
        return this.client;
    }

    public getPublisher(): Redis {
        return this.publisher;
    }

    public getSubscriber(): Redis {
        return this.subscriber;
    }

    /**
     * Returns true only when all three Redis clients are in the 'ready' state.
     * Use this for health-check endpoints rather than relying on connection events.
     */
    public isHealthy(): boolean {
        return (
            this.client.status === 'ready' &&
            this.publisher.status === 'ready' &&
            this.subscriber.status === 'ready'
        );
    }

    public async quit(): Promise<void> {
        try {
            await Promise.all([
                this.client.quit(),
                this.publisher.quit(),
                this.subscriber.quit(),
            ]);
            this.logger.info(
                '[RedisService] All Redis connections closed gracefully',
            );
        } catch (error) {
            this.logger.error(
                '[RedisService] Error closing Redis connections:',
                error,
            );
        }
    }
}
