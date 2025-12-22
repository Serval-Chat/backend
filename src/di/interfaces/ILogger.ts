/**
 * Logger Interface.
 */
export interface ILogger {
    /**
     * Log an informational message.
     *
     * @param message - The message to log
     * @param meta - Optional structured context (e.g., { userId: '...' })
     */
    info(message: string, meta?: any): void;

    /**
     * Log an error message.
     *
     * @param message - The error description
     * @param error - The error object or additional context
     */
    error(message: string, error?: Error | any): void;

    /**
     * Log a warning message.
     */
    warn(message: string, meta?: any): void;

    /**
     * Log a debug message.
     */
    debug(message: string, meta?: any): void;
}
