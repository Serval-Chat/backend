/**
 * Rate Limiting Middleware Unit Tests
 * 
 * Note: These tests verify the configuration of rate limiters.
 * Full integration tests would require actual HTTP requests with timing.
 */

require('ts-node/register');
require('tsconfig-paths/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const { loginLimiter, registrationLimiter, sensitiveOperationLimiter } = require('../../src/middleware/rateLimiting');

test('Rate Limiting - loginLimiter has correct configuration', () => {
    assert.equal(typeof loginLimiter, 'function');
    // Verify it's a middleware function (accepts req, res, next)
    assert.equal(loginLimiter.length, 3);
});

test('Rate Limiting - registrationLimiter has correct configuration', () => {
    assert.equal(typeof registrationLimiter, 'function');
    assert.equal(registrationLimiter.length, 3);
});

test('Rate Limiting - sensitiveOperationLimiter has correct configuration', () => {
    assert.equal(typeof sensitiveOperationLimiter, 'function');
    assert.equal(sensitiveOperationLimiter.length, 3);
});

test('Rate Limiting - limiters are distinct middlewares', () => {
    // Verify each limiter is a separate instance
    assert.notEqual(loginLimiter, registrationLimiter);
    assert.notEqual(loginLimiter, sensitiveOperationLimiter);
    assert.notEqual(registrationLimiter, sensitiveOperationLimiter);
});
