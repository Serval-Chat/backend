/**
 * Validation Middleware Unit Tests
 */

require('ts-node/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const { z } = require('zod');
const { validate } = require('../../src/middleware/validate');
const { createMockRequest, createMockResponse, createMockNext } = require('../utils/test-utils.cjs');

test('Validation Middleware - valid body passes', async () => {
    const schema = z.object({
        username: z.string(),
        email: z.string().email()
    });

    const req = createMockRequest({
        body: { username: 'testuser', email: 'test@example.com' }
    });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = validate({ body: schema });
    await middleware(req, res, next);

    assert.equal(next.called, true);
    assert.equal(res.status.called, false); // No error response
});

test('Validation Middleware - invalid body returns 400', async () => {
    const schema = z.object({
        username: z.string().min(3),
        email: z.string().email()
    });

    const req = createMockRequest({
        body: { username: 'ab', email: 'invalid-email' } // Too short and invalid email
    });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = validate({ body: schema });
    await middleware(req, res, next);

    assert.equal(next.called, false);
    assert.equal(res.statusCode, 400);
    assert.ok(res.jsonData);
    assert.ok(res.jsonData.error);
});

test('Validation Middleware - invalid query returns 400', async () => {
    const schema = z.object({
        page: z.string().regex(/^\d+$/),
        limit: z.string().regex(/^\d+$/)
    });

    const req = createMockRequest({
        query: { page: 'abc', limit: '10' } // Invalid page number
    });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = validate({ query: schema });
    await middleware(req, res, next);

    assert.equal(next.called, false);
    assert.equal(res.statusCode, 400);
    assert.ok(res.jsonData);
    assert.ok(res.jsonData.error);
});

test('Validation Middleware - invalid params returns 400', async () => {
    const schema = z.object({
        id: z.string().length(24) // MongoDB ObjectId length
    });

    const req = createMockRequest({
        params: { id: 'short' }
    });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = validate({ params: schema });
    await middleware(req, res, next);

    assert.equal(next.called, false);
    assert.equal(res.statusCode, 400);
    assert.ok(res.jsonData);
    assert.ok(res.jsonData.error);
});

test('Validation Middleware - valid request with multiple schemas', async () => {
    const bodySchema = z.object({ name: z.string() });
    const paramsSchema = z.object({ id: z.string() });
    const querySchema = z.object({ filter: z.string().optional() });

    const req = createMockRequest({
        body: { name: 'Test' },
        params: { id: '123' },
        query: { filter: 'active' }
    });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = validate({
        body: bodySchema,
        params: paramsSchema,
        query: querySchema
    });
    await middleware(req, res, next);

    assert.equal(next.called, true);
    assert.equal(res.status.called, false);
});

test('Validation Middleware - Zod transforms data correctly', async () => {
    const schema = z.object({
        username: z.string().toLowerCase(), // Transform to lowercase
        age: z.string().transform(val => parseInt(val, 10))
    });

    const req = createMockRequest({
        body: { username: 'TESTUSER', age: '25' }
    });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = validate({ body: schema });
    await middleware(req, res, next);

    assert.equal(next.called, true);
    assert.equal(req.body.username, 'testuser'); // Transformed
    assert.equal(req.body.age, 25); // Parsed to number
});

test('Validation Middleware - missing required field', async () => {
    const schema = z.object({
        username: z.string(),
        password: z.string()
    });

    const req = createMockRequest({
        body: { username: 'testuser' } // Missing password
    });
    const res = createMockResponse();
    const next = createMockNext();

    const middleware = validate({ body: schema });
    await middleware(req, res, next);

    assert.equal(next.called, false);
    assert.equal(res.statusCode, 400);
    assert.ok(res.jsonData);
    assert.ok(res.jsonData.error);
});
