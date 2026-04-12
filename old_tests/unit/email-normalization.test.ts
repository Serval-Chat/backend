/**
 * Tests for email normalization utility
 */

import assert from 'assert';
import { normalizeEmail, emailsEqual } from '../../src/utils/email';

describe('Email Normalization', () => {
    describe('normalizeEmail()', () => {
        it('should strip plus-addressing from email', () => {
            const result = normalizeEmail('user+tag@example.com');
            assert.strictEqual(result, 'user@example.com');
        });

        it('should handle multiple plus signs (only remove after first +)', () => {
            const result = normalizeEmail('user+tag+other@example.com');
            assert.strictEqual(result, 'user@example.com');
        });

        it('should convert email to lowercase', () => {
            const result = normalizeEmail('User+Tag@Example.COM');
            assert.strictEqual(result, 'user@example.com');
        });

        it('should trim whitespace', () => {
            const result = normalizeEmail('  user+tag@example.com  ');
            assert.strictEqual(result, 'user@example.com');
        });

        it('should handle email without plus addressing', () => {
            const result = normalizeEmail('simple@example.com');
            assert.strictEqual(result, 'simple@example.com');
        });

        it('should handle email with uppercase and no plus', () => {
            const result = normalizeEmail('User@Example.COM');
            assert.strictEqual(result, 'user@example.com');
        });

        it('should handle Gmail-style addresses', () => {
            const result = normalizeEmail('example+test@gmail.com');
            assert.strictEqual(result, 'example@gmail.com');
        });

        it('should handle nested plus signs correctly', () => {
            const result = normalizeEmail('user+alias+more@domain.co.uk');
            assert.strictEqual(result, 'user@domain.co.uk');
        });

        it('should handle empty string', () => {
            const result = normalizeEmail('');
            assert.strictEqual(result, '');
        });

        it('should handle email without @ symbol', () => {
            const result = normalizeEmail('invalid-email');
            assert.strictEqual(result, 'invalid-email');
        });

        it('should preserve domain case in original but lowercase final result', () => {
            const result = normalizeEmail('User+Tag@EXAMPLE.COM');
            assert.strictEqual(result, 'user@example.com');
        });
    });

    describe('emailsEqual()', () => {
        it('should treat aliased emails as equal', () => {
            const result = emailsEqual(
                'user+tag@example.com',
                'user@example.com',
            );
            assert.strictEqual(result, true);
        });

        it('should treat multiple aliases of same user as equal', () => {
            const result = emailsEqual(
                'user+tag1@example.com',
                'user+tag2@example.com',
            );
            assert.strictEqual(result, true);
        });

        it('should be case insensitive', () => {
            const result = emailsEqual(
                'User+Tag@Example.COM',
                'user@EXAMPLE.com',
            );
            assert.strictEqual(result, true);
        });

        it('should not treat different base emails as equal', () => {
            const result = emailsEqual(
                'user1+tag@example.com',
                'user2+tag@example.com',
            );
            assert.strictEqual(result, false);
        });

        it('should not treat different domains as equal', () => {
            const result = emailsEqual(
                'user@example.com',
                'user@different.com',
            );
            assert.strictEqual(result, false);
        });

        it('should handle Gmail example from issue', () => {
            const result = emailsEqual(
                'example@gmail.com',
                'example+test@gmail.com',
            );
            assert.strictEqual(result, true);
        });

        it('should handle multiple aliases from issue', () => {
            const result = emailsEqual(
                'example+anything@gmail.com',
                'example+test@gmail.com',
            );
            assert.strictEqual(result, true);
        });
    });
});
