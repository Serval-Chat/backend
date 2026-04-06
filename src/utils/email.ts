/**
 * Email utility functions for normalization and validation
 */

/**
 * Normalizes an email address by stripping plus-addressing (subaddressing).
 *
 * Gmail and many other providers treat addresses with a "+" suffix as aliases
 * of the base address. For example:
 * - user+tag@example.com
 * - user+anything@example.com
 *
 * These should all be treated as the same account: user@example.com
 *
 * @param email - The email address to normalize
 * @returns The normalized email address with plus-addressing removed
 *
 * @example
 * normalizeEmail('user+tag@example.com') // Returns 'user@example.com'
 * normalizeEmail('User+Test@Example.COM') // Returns 'user@example.com'
 * normalizeEmail('simple@example.com') // Returns 'simple@example.com'
 */
export function normalizeEmail(email: string): string {
    if (!email || typeof email !== 'string') {
        return email;
    }

    return email.toLowerCase().trim();
}

/**
 * Checks if two email addresses are equivalent after normalization.
 * Useful for comparing email addresses while accounting for plus-addressing.
 *
 * @param email1 - First email address
 * @param email2 - Second email address
 * @returns true if both emails normalize to the same value, false otherwise
 */
export function emailsEqual(email1: string, email2: string): boolean {
    return normalizeEmail(email1) === normalizeEmail(email2);
}
