/**
 * TSOA Endpoints Integration Tests
 */

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setup, teardown, getApp } = require('./setup.cjs');
const { clearDatabase, createTestUser, generateAuthToken } = require('./helpers.cjs');

describe('TSOA Endpoints Integration Tests', () => {
    let app;

    before(async () => {
        await setup();
        app = getApp();
    });

    after(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await clearDatabase();
    });

    describe('ProfileController', () => {
        test('GET /api/v1/profile/me - should return current user profile', async () => {
            const user = await createTestUser({
                displayName: 'Test User',
                bio: 'Hello world',
                pronouns: 'they/them'
            });
            const token = generateAuthToken(user);

            const res = await request(app)
                .get('/api/v1/profile/me')
                .set('Authorization', `Bearer ${token}`);

            assert.equal(res.status, 200);
            assert.equal(res.body.id, user._id.toString());
            assert.equal(res.body.username, user.username);
            assert.equal(res.body.displayName, 'Test User');
            assert.equal(res.body.bio, 'Hello world');
            assert.equal(res.body.pronouns, 'they/them');
        });

        test('GET /api/v1/profile/{userId} - should return user profile by ID', async () => {
            const user = await createTestUser({
                displayName: 'Other User'
            });
            const viewer = await createTestUser();
            const token = generateAuthToken(viewer);

            const res = await request(app)
                .get(`/api/v1/profile/${user._id}`)
                .set('Authorization', `Bearer ${token}`);

            assert.equal(res.status, 200);
            assert.equal(res.body.id, user._id.toString());
            assert.equal(res.body.displayName, 'Other User');
        });

        test('PATCH /api/v1/profile/bio - should update bio', async () => {
            const user = await createTestUser();
            const token = generateAuthToken(user);

            const res = await request(app)
                .patch('/api/v1/profile/bio')
                .set('Authorization', `Bearer ${token}`)
                .send({ bio: 'New bio' });

            assert.equal(res.status, 200);
            assert.equal(res.body.bio, 'New bio');

            // Verify in DB
            const { User } = require('../../src/models/User');
            const updatedUser = await User.findById(user._id);
            assert.equal(updatedUser.bio, 'New bio');
        });
    });

    describe('AdminController', () => {
        test('GET /api/v1/admin/stats - should return stats for admin', async () => {
            const admin = await createTestUser({
                permissions: {
                    adminAccess: true,
                    viewLogs: true,
                    viewUsers: true,
                    manageUsers: false,
                    manageBadges: false,
                    banUsers: false,
                    viewBans: false,
                    warnUsers: false,
                    manageServer: false,
                    manageInvites: false
                }
            });
            const token = generateAuthToken(admin);

            const res = await request(app)
                .get('/api/v1/admin/stats')
                .set('Authorization', `Bearer ${token}`);

            assert.equal(res.status, 200);
            assert.ok(res.body.users !== undefined);
            assert.ok(res.body.activeUsers !== undefined);
        });

        test('GET /api/v1/admin/stats - should fail for user without viewLogs permission', async () => {
            const user = await createTestUser({
                permissions: {
                    adminAccess: true,
                    viewLogs: false,
                    viewUsers: true,
                    manageUsers: false,
                    manageBadges: false,
                    banUsers: false,
                    viewBans: false,
                    warnUsers: false,
                    manageServer: false,
                    manageInvites: false
                }
            });
            const token = generateAuthToken(user);

            const res = await request(app)
                .get('/api/v1/admin/stats')
                .set('Authorization', `Bearer ${token}`);

            assert.equal(res.status, 403);
        });

        test('GET /api/v1/admin/users - should list users', async () => {
            await createTestUser({ username: 'user1' });
            await createTestUser({ username: 'user2' });

            const admin = await createTestUser({
                permissions: {
                    adminAccess: true,
                    viewUsers: true,
                    viewLogs: false,
                    manageUsers: false,
                    manageBadges: false,
                    banUsers: false,
                    viewBans: false,
                    warnUsers: false,
                    manageServer: false,
                    manageInvites: false
                }
            });
            const token = generateAuthToken(admin);

            const res = await request(app)
                .get('/api/v1/admin/users')
                .set('Authorization', `Bearer ${token}`);

            assert.equal(res.status, 200);
            assert.ok(Array.isArray(res.body));
            assert.ok(res.body.length >= 3); // 2 users + 1 admin
        });
    });
});
