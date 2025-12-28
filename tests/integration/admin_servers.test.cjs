/**
 * Admin Servers Integration Tests
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setup, teardown, getApp } = require('./setup.cjs');
const { clearDatabase, createTestUser, generateAuthToken, createTestServer } = require('./helpers.cjs');

describe('Admin Servers Integration Tests', () => {
    let app;
    let adminUser;
    let adminToken;
    let testServer;
    let testOwner;

    before(async () => {
        await setup();
        app = getApp();
        await clearDatabase();

        // Create admin user
        adminUser = await createTestUser({
            permissions: { adminAccess: true, manageServer: true }
        });
        adminToken = generateAuthToken(adminUser);

        // Create a regular user (server owner)
        testOwner = await createTestUser();

        // Create a server
        testServer = await createTestServer(testOwner._id, {
            icon: 'test-icon.png'
        });
    });

    after(async () => {
        await teardown();
    });

    test('GET /api/v1/admin/servers should return enriched server data', async () => {
        const res = await request(app)
            .get('/api/v1/admin/servers')
            .set('Authorization', `Bearer ${adminToken}`);

        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body));
        
        const server = res.body.find(s => s._id === testServer._id.toString());
        assert.ok(server, 'Server should be found in the list');
        
        // Check icon
        assert.equal(server.icon, 'test-icon.png');
        
        // Check owner details
        assert.ok(server.owner, 'Owner details should be present');
        assert.equal(server.owner._id, testOwner._id.toString());
        assert.equal(server.owner.username, testOwner.username);
    });
});
