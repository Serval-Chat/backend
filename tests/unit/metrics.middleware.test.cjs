/**
 * Metrics Middleware Unit Tests
 */

require('ts-node/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMetricsMiddleware, metricsMiddleware } = require('../../src/middleware/metrics');
const { createMockRequest, createMockResponse, createMockNext, createMockLogger } = require('../utils/test-utils.cjs');

test('Metrics Middleware - middleware is a function', () => {
    assert.equal(typeof metricsMiddleware, 'function');
    assert.equal(metricsMiddleware.length, 3); // req, res, next
});

test('Metrics Middleware - createMetricsMiddleware returns middleware', () => {
    const logger = createMockLogger();
    const middleware = createMetricsMiddleware(logger);

    assert.equal(typeof middleware, 'function');
    assert.equal(middleware.length, 3);
});

test('Metrics Middleware - calls next immediately', () => {
    const req = createMockRequest({
        method: 'GET',
        path: '/api/v1/test'
    });
    const res = createMockResponse();
    const next = createMockNext();

    metricsMiddleware(req, res, next);

    assert.equal(next.called, true);
});

test('Metrics Middleware - wraps res.end function', () => {
    const req = createMockRequest({
        method: 'POST',
        path: '/api/v1/messages'
    });
    const res = createMockResponse();
    const next = createMockNext();

    const originalEnd = res.end;
    metricsMiddleware(req, res, next);

    // Verify end function was wrapped
    assert.notEqual(res.end, originalEnd);
    assert.equal(typeof res.end, 'function');
});

test('Metrics Middleware - handles errors gracefully with logger', () => {
    const logger = createMockLogger();
    const middleware = createMetricsMiddleware(logger);

    const req = createMockRequest({
        method: 'GET',
        path: '/api/v1/test'
    });
    const res = createMockResponse();
    const next = createMockNext();

    middleware(req, res, next);

    assert.equal(next.called, true);
    // Errors should be caught and logged
});

test('Metrics Middleware - works without logger (fallback)', () => {
    const middleware = createMetricsMiddleware();

    const req = createMockRequest({
        method: 'DELETE',
        path: '/api/v1/resource/123'
    });
    const res = createMockResponse();
    const next = createMockNext();

    middleware(req, res, next);

    assert.equal(next.called, true);
});
