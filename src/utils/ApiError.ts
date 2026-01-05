/**
 * Custom error class for API errors that includes an HTTP status code.
 * This allows controllers to throw errors that are correctly handled by the error middleware.
 */
export class ApiError extends Error {
    public status: number;
    public details?: unknown;

    constructor(status: number, message: string, details?: unknown) {
        super(message);
        this.status = status;
        this.details = details;
        this.name = 'ApiError';

        // This is needed for instanceof to work correctly after transpilation
        Object.setPrototypeOf(this, ApiError.prototype);
    }
}
