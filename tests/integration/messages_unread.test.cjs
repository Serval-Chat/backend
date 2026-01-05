const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setup, teardown, getApp } = require('./setup.cjs');
const { clearDatabase, createTestUser, generateAuthToken } = require('./helpers.cjs');

describe('Messages Unread Integration Tests', () => {
    let app;
    let user;
    let userToken;

    before(async () => {
        await setup();
        app = getApp();
        await clearDatabase();

        // Create user
        user = await createTestUser();
        userToken = generateAuthToken(user);
    });

    after(async () => {
        await teardown();
    });

    test('GET /api/v1/messages/unread should return unread counts', async () => {
        const res = await request(app)
            .get('/api/v1/messages/unread')
            .set('Authorization', `Bearer ${userToken}`);

        // EXPECT SUCCESS (200) AFTER IMPLEMENTATION
        assert.equal(res.status, 200);
        assert.ok(res.body.counts !== undefined);
        assert.ok(typeof res.body.counts === 'object');
    });
});
