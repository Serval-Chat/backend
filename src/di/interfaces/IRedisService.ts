import type { Redis } from 'ioredis';

export interface IRedisService {
    /**
     * Get the main Redis client
     */
    getClient(): Redis;

    /**
     * Get the Redis publisher client for Pub/Sub
     */
    getPublisher(): Redis;

    /**
     * Get the Redis subscriber client for Pub/Sub
     */
    getSubscriber(): Redis;

    /**
     * Returns true only when all three Redis clients (main, publisher, subscriber)
     * are in the 'ready' state.
     */
    isHealthy(): boolean;

    /**
     * Gracefully close all Redis connections
     */
    quit(): Promise<void>;
}
