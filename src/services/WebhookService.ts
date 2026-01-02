import crypto from 'crypto';

// Generate a secure 128-character hex token for webhooks.
export function generateWebhookToken(): string {
    return crypto.randomBytes(64).toString('hex'); // 64 bytes = 128 hex characters
}
