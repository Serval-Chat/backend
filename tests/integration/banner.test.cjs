/**
 * Banner Integration Tests
 */

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setup, teardown, getApp } = require('./setup.cjs');
const { clearDatabase, createTestUser, generateAuthToken } = require('./helpers.cjs');
const path = require('path');
const fs = require('fs');

describe('Banner Integration Tests', () => {
    let app;

    before(async () => {
        const result = await setup();
        app = result.app;
    });

    after(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await clearDatabase();
    });

    test('POST /api/v1/profile/banner - should upload banner', async () => {
        const user = await createTestUser();
        const token = generateAuthToken(user);

        // Create a tiny valid PNG buffer
        const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

        const res = await request(app)
            .post('/api/v1/profile/banner')
            .set('Authorization', `Bearer ${token}`)
            .attach('banner', pngBuffer, 'test-banner.png');

        assert.equal(res.status, 200);
        assert.ok(res.body.banner);
        assert.equal(res.body.message, 'Profile banner updated successfully');

        // Verify in DB
        const { User } = require('../../src/models/User');
        const updatedUser = await User.findById(user._id);
        assert.ok(updatedUser.banner);
    });

    test('GET /api/v1/profile/banner/{filename} - should retrieve banner', async () => {
        const user = await createTestUser();
        const token = generateAuthToken(user);
        const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

        // First upload
        const uploadRes = await request(app)
            .post('/api/v1/profile/banner')
            .set('Authorization', `Bearer ${token}`)
            .attach('banner', pngBuffer, 'test-banner.png');

        const bannerUrl = uploadRes.body.banner;

        // Then retrieve
        const res = await request(app)
            .get(bannerUrl);

        assert.equal(res.status, 200);
        assert.equal(res.header['content-type'], 'image/png');
    });

    test('POST /api/v1/admin/users/{userId}/reset - should reset banner', async () => {
        const user = await createTestUser({ banner: 'some-banner.webp' });
        const admin = await createTestUser({
            permissions: {
                adminAccess: true,
                manageUsers: true
            }
        });
        const token = generateAuthToken(admin);

        const res = await request(app)
            .post(`/api/v1/admin/users/${user._id}/reset`)
            .set('Authorization', `Bearer ${token}`)
            .send({ fields: ['banner'] });

        assert.equal(res.status, 200);
        assert.equal(res.body.message, 'User profile fields reset');

        // Verify in DB
        const { User } = require('../../src/models/User');
        const updatedUser = await User.findById(user._id);
        assert.strictEqual(updatedUser.banner, null);
    });

    test('GET /api/v1/profile/me - should include banner URL', async () => {
        const user = await createTestUser({ banner: 'test-banner.webp' });
        const token = generateAuthToken(user);

        const res = await request(app)
            .get('/api/v1/profile/me')
            .set('Authorization', `Bearer ${token}`);

        assert.equal(res.status, 200);
        assert.equal(res.body.banner, '/api/v1/profile/banner/test-banner.webp');
    });
});
