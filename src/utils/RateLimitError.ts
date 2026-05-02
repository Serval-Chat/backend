export class RateLimitError extends Error {
    public constructor(public type: 'USER' | 'IP') {
        super(`${type}_RATE_LIMIT_EXCEEDED`);
        this.name = 'RateLimitError';
        // Restore prototype chain for instanceof checks
        Object.setPrototypeOf(this, RateLimitError.prototype);
    }
}
