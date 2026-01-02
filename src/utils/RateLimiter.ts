// In-memory rate limiter using sliding window algorithm
// Tracks request counts per key within a time window
export class RateLimiter {
    private hits = new Map<string, { count: number; expiresAt: number }>();

    constructor(
        private limit: number,
        private windowMs: number,
    ) { }

    // Check if a request for the given key is within rate limits
    // Automatically creates new windows and resets expired ones
    //
    // @param key - Unique identifier (e.g., user ID, IP address)
    // @returns true if request is allowed, false if rate limit exceeded
    check(key: string): boolean {
        const now = Date.now();
        const record = this.hits.get(key);

        if (!record || now > record.expiresAt) {
            this.hits.set(key, { count: 1, expiresAt: now + this.windowMs });
            return true;
        }

        record.count++;
        return record.count <= this.limit;
    }

    // Remove expired entries to prevent memory leaks
    // Should be called periodically if the limiter is long-lived
    cleanup() {
        const now = Date.now();
        for (const [key, record] of this.hits.entries()) {
            if (now > record.expiresAt) {
                this.hits.delete(key);
            }
        }
    }
}
