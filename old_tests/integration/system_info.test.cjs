const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setup, teardown, getApp } = require('./setup.cjs');

describe('System Info Integration Tests', () => {
    let app;

    before(async () => {
        await setup();
        app = getApp();
    });

    after(async () => {
        await teardown();
    });

    test('GET /api/v1/system/info should return system information', async () => {
        const res = await request(app)
            .get('/api/v1/system/info');

        // EXPECT SUCCESS (200) AFTER IMPLEMENTATION
        assert.equal(res.status, 200);
        assert.ok(res.body.version);
        assert.ok(res.body.commitHash);
        assert.ok(res.body.partialCommitHash);
    });
});
