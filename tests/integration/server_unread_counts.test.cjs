/**
 * Server Unread Counts Integration Tests
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setup, teardown, getApp } = require('./setup.cjs');
const { clearDatabase, createTestUser, generateAuthToken, createTestServer } = require('./helpers.cjs');

describe('Server Unread Counts Integration Tests', () => {
    let app;
    let user;
    let userToken;

    before(async () => {
        await setup();
        app = getApp();
        await clearDatabase();

        user = await createTestUser();
        userToken = generateAuthToken(user);
    });

    after(async () => {
        await teardown();
    });

    test('GET /api/v1/servers/unread should return object with hasUnread and pingCount', async () => {
        const server = await createTestServer(user._id);

        const res = await request(app)
            .get('/api/v1/servers/unread')
            .set('Authorization', `Bearer ${userToken}`);

        assert.equal(res.status, 200);
        assert.ok(typeof res.body === 'object');
        const serverStatus = res.body[server._id.toString()];
        assert.ok(serverStatus !== undefined);
        assert.ok(typeof serverStatus.hasUnread === 'boolean');
        assert.ok(typeof serverStatus.pingCount === 'number');
    });
});
