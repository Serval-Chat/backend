export interface IRedisService {
    /**
     * Get the main Redis client
     */
    getClient(): import('ioredis').Redis;
    
    /**
     * Get the Redis publisher client for Pub/Sub
     */
    getPublisher(): import('ioredis').Redis;
    
    /**
     * Get the Redis subscriber client for Pub/Sub
     */
    getSubscriber(): import('ioredis').Redis;
    
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
