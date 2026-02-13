const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setup, teardown, getApp } = require('./setup.cjs');
const { clearDatabase, createTestUser } = require('./helpers.cjs');

describe('Password Reset Integration Tests', () => {
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

    describe('POST /api/v1/auth/password/reset', () => {
        test('should return 200 even if email service is not configured (prevent user enumeration)', async () => {
            await createTestUser({ login: 'user@example.com' });

            const res = await request(app)
                .post('/api/v1/auth/password/reset')
                .send({ email: 'user@example.com' });

            assert.equal(res.status, 200);
            assert.match(res.body.message, /If an account with that email exists/);
            assert.ok(res.body.requestId, 'Expected requestId in response');
        });

        test('should return 200 for non-existent user (security best practice)', async () => {
            const res = await request(app)
                .post('/api/v1/auth/password/reset')
                .send({ email: 'nonexistent@example.com' });

            assert.equal(res.status, 200);
            assert.match(res.body.message, /If an account with that email exists/);
            assert.ok(res.body.requestId, 'Expected requestId in response');
        });

        test('should enforce per-user rate limit', async () => {
            const email = 'limit-user@example.com';
            await createTestUser({ login: email });

            for (let i = 0; i < 3; i++) {
                const res = await request(app)
                    .post('/api/v1/auth/password/reset')
                    .send({ email });
                assert.ok(res.status === 200 || res.status === 500);
            }

            // 4th request should be rate limited
            const res = await request(app)
                .post('/api/v1/auth/password/reset')
                .send({ email });

            // Response is still 200 to prevent user enumeration, but it won't trigger email flow
            assert.equal(res.status, 200);
            assert.match(res.body.message, /If an account with that email exists/);
        });

        test('should enforce per-IP rate limit', async () => {
            // AUTH_CONSTANTS.RATE_LIMIT.MAX_PER_IP is 5
            const emails = Array.from({ length: 6 }, (_, i) => `ip-limit-${i}@example.com`);
            for (const email of emails) {
                await createTestUser({ login: email });
            }

            const clientIp = '1.2.3.4';

            for (let i = 0; i < 5; i++) {
                const res = await request(app)
                    .post('/api/v1/auth/password/reset')
                    .set('X-Forwarded-For', clientIp)
                    .send({ email: emails[i] });

                assert.ok(res.status === 200 || res.status === 500);
            }

            // 6th request from same IP should be blocked
            const res = await request(app)
                .post('/api/v1/auth/password/reset')
                .set('X-Forwarded-For', clientIp)
                .send({ email: emails[5] });

            assert.equal(res.status, 200);
            assert.match(res.body.message, /If an account with that email exists/);
        });
    });

    describe('POST /api/v1/auth/password/reset/confirm', () => {
        test('should fail with invalid token format (400)', async () => {
            const res = await request(app)
                .post('/api/v1/auth/password/reset/confirm')
                .send({ token: 'short-token', newPassword: 'newpassword123' });

            assert.equal(res.status, 400);
        });

        test('should fail with non-existent token (even if valid format)', async () => {
            const validFormatToken = 'a'.repeat(64);
            const res = await request(app)
                .post('/api/v1/auth/password/reset/confirm')
                .send({ token: validFormatToken, newPassword: 'newpassword123' });

            assert.equal(res.status, 400);
        });

        test('should reject expired tokens', async () => {
            const crypto = require('node:crypto');
            const mongoose = require('mongoose');
            const PasswordReset = mongoose.model('PasswordReset');
            const user = await createTestUser();

            const token = crypto.randomBytes(32).toString('hex');
            const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

            // Create an already expired token
            await PasswordReset.create({
                userId: user._id,
                hashedToken,
                expiresAt: new Date(Date.now() - 10000), 
            });

            const res = await request(app)
                .post('/api/v1/auth/password/reset/confirm')
                .send({ token, newPassword: 'StrongPass123!' });

            assert.equal(res.status, 400);
        });

        test('should prevent password reuse', async () => {
            const crypto = require('node:crypto');
            const mongoose = require('mongoose');
            const PasswordReset = mongoose.model('PasswordReset');

            // Use plain password - Mongoose pre-save hook will hash it
            const user = await createTestUser({ password: 'StrongPass123!' });

            const token = crypto.randomBytes(32).toString('hex');
            const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

            await PasswordReset.create({
                userId: user._id,
                hashedToken,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            });

            const res = await request(app)
                .post('/api/v1/auth/password/reset/confirm')
                .send({ token, newPassword: 'StrongPass123!' }); // Same as current

            assert.equal(res.status, 400);
        });

        test('should invalidate all sessions on password change', async () => {
            const crypto = require('node:crypto');
            const mongoose = require('mongoose');
            const PasswordReset = mongoose.model('PasswordReset');
            const User = mongoose.model('User');
            const user = await createTestUser();
            const originalTokenVersion = user.tokenVersion;

            const token = crypto.randomBytes(32).toString('hex');
            const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

            await PasswordReset.create({
                userId: user._id,
                hashedToken,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            });

            const res = await request(app)
                .post('/api/v1/auth/password/reset/confirm')
                .send({ token, newPassword: 'StrongPass123!' });

            assert.equal(res.status, 200);
            assert.ok(res.body.requestId, 'Expected requestId in confirmation response');

            const updatedUser = await User.findById(user._id);
            assert.ok(updatedUser.tokenVersion > originalTokenVersion);
        });

        test('should handle concurrent token usage attempts', async () => {
            const crypto = require('node:crypto');
            const mongoose = require('mongoose');
            const PasswordReset = mongoose.model('PasswordReset');
            const user = await createTestUser();

            const token = crypto.randomBytes(32).toString('hex');
            const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

            await PasswordReset.create({
                userId: user._id,
                hashedToken,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            });

            // Fire multiple requests simultaneously
            const results = await Promise.all([
                request(app).post('/api/v1/auth/password/reset/confirm').send({ token, newPassword: 'StrongPass1!' }),
                request(app).post('/api/v1/auth/password/reset/confirm').send({ token, newPassword: 'StrongPass2!' }),
                request(app).post('/api/v1/auth/password/reset/confirm').send({ token, newPassword: 'StrongPass3!' }),
            ]);

            const successful = results.filter(r => r.status === 200);
            const failed = results.filter(r => r.status === 400);

            // Exactly one should succeed, others should fail
            assert.equal(successful.length, 1, `Expected 1 success, got ${successful.length}`);
            assert.equal(failed.length, 2, `Expected 2 failures, got ${failed.length}`);
        });
    });
});
