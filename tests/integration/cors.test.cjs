/**
 * CORS Integration Tests
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setup, teardown, getApp } = require('./setup.cjs');

describe('CORS Integration Tests', () => {
    let app;

    before(async () => {
        await setup();
        app = getApp();
    });

    after(async () => {
        await teardown();
    });

    /**
     * Test that preflight OPTIONS requests return Access-Control-Max-Age.
     * This ensures browsers cache the preflight result.
     */
    test('should include Access-Control-Max-Age header in OPTIONS response', async () => {
        const res = await request(app)
            .options('/api/v1/profile/me')
            .set('Origin', 'http://localhost:5173')
            .set('Access-Control-Request-Method', 'GET')
            .set('Access-Control-Request-Headers', 'Content-Type,Authorization');

        assert.equal(res.status, 204);
        assert.equal(res.headers['access-control-max-age'], '86400');
        assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5173');
        assert.equal(res.headers['access-control-allow-methods'], 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
        assert.equal(res.headers['access-control-allow-headers'], 'Content-Type,Authorization');
        assert.equal(res.headers['access-control-allow-credentials'], 'true');
    });
});
