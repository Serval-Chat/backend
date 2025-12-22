/**
 * JWT Middleware Unit Tests
 * 
 * Tests for the authenticateToken middleware including token validation,
 * expiration checking, token version validation, and ban enforcement.
 */

require('ts-node/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../../src/config/env');
const { authenticateToken } = require('../../src/middleware/auth');
const {
    createMockRequest,
    createMockResponse,
    createMockNext,
    createTestUser,
    createTestBan
} = require('../utils/test-utils.cjs');

// Mock the User and Ban models
const { User } = require('../../src/models/User');
const { Ban } = require('../../src/models/Ban');

test('JWT Middleware - valid token passes authentication', async () => {
    const testUser = createTestUser({
        _id: '507f1f77bcf86cd799439011',
        username: 'testuser',
        tokenVersion: 0
    });

    // Mock User.findById
    const originalFindById = User.findById;
    User.findById = (id) => ({
        select: () => ({
            lean: async () => testUser
        })
    });

    // Mock Ban.checkExpired and findOne
    const originalCheckExpired = Ban.checkExpired;
    const originalFindOne = Ban.findOne;
    Ban.checkExpired = async () => { };
    Ban.findOne = async () => null; // No active ban

    const token = jwt.sign({
        id: testUser._id,
        username: testUser.username,
        login: testUser.login,
        tokenVersion: 0
    }, JWT_SECRET);

    const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
        path: '/api/v1/test'
    });
    const res = createMockResponse();
    const next = createMockNext();

    await authenticateToken(req, res, next);

    assert.equal(next.called, true);
    assert.ok(req.user);
    assert.equal(req.user.id, testUser._id);
    assert.equal(req.user.username, 'testuser');

    // Restore mocks
    User.findById = originalFindById;
    Ban.checkExpired = originalCheckExpired;
    Ban.findOne = originalFindOne;
});

test('JWT Middleware - invalid token returns 401 for API requests', async () => {
    const req = createMockRequest({
        headers: { authorization: 'Bearer invalidtoken' },
        path: '/api/v1/test'
    });
    const res = createMockResponse();
    const next = createMockNext();

    await authenticateToken(req, res, next);

    assert.equal(next.called, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Invalid token');
});

test('JWT Middleware - invalid token redirects for web requests', async () => {
    const req = createMockRequest({
        headers: { authorization: 'Bearer invalidtoken' },
        path: '/chat' // Non-API path
    });
    const res = createMockResponse();
    const next = createMockNext();

    await authenticateToken(req, res, next);

    assert.equal(next.called, false);
    assert.equal(res.redirectUrl, '/login.html');
});

test('JWT Middleware - missing token returns 401 for API requests', async () => {
    const req = createMockRequest({
        headers: {},
        path: '/api/v1/test'
    });
    const res = createMockResponse();
    const next = createMockNext();

    await authenticateToken(req, res, next);

    assert.equal(next.called, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'No token provided');
});

test('JWT Middleware - missing token redirects for web requests', async () => {
    const req = createMockRequest({
        headers: {},
        path: '/dashboard'
    });
    const res = createMockResponse();
    const next = createMockNext();

    await authenticateToken(req, res, next);

    assert.equal(next.called, false);
    assert.equal(res.redirectUrl, '/login.html');
});

test('JWT Middleware - expired token returns 401', async () => {
    const token = jwt.sign({
        id: '507f1f77bcf86cd799439011',
        username: 'testuser',
        tokenVersion: 0
    }, JWT_SECRET, { expiresIn: '-1h' }); // Already expired

    const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
        path: '/api/v1/test'
    });
    const res = createMockResponse();
    const next = createMockNext();

    await authenticateToken(req, res, next);

    assert.equal(next.called, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Invalid token');
});

test('JWT Middleware - token with wrong version is rejected', async () => {
    const testUser = createTestUser({
        _id: '507f1f77bcf86cd799439011',
        username: 'testuser',
        tokenVersion: 5 // User has version 5
    });

    const originalFindById = User.findById;
    User.findById = (id) => ({
        select: () => ({
            lean: async () => testUser
        })
    });

    const token = jwt.sign({
        id: testUser._id,
        username: testUser.username,
        tokenVersion: 0 // Token has old version 0
    }, JWT_SECRET);

    const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
        path: '/api/v1/test'
    });
    const res = createMockResponse();
    const next = createMockNext();

    await authenticateToken(req, res, next);

    assert.equal(next.called, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Token expired');

    User.findById = originalFindById;
});

test('JWT Middleware - deleted user token is rejected', async () => {
    const deletedUser = createTestUser({
        _id: '507f1f77bcf86cd799439011',
        username: 'deleteduser',
        tokenVersion: 0,
        deletedAt: new Date() // User is soft-deleted
    });

    const originalFindById = User.findById;
    User.findById = (id) => ({
        select: () => ({
            lean: async () => deletedUser
        })
    });

    const token = jwt.sign({
        id: deletedUser._id,
        username: deletedUser.username,
        tokenVersion: 0
    }, JWT_SECRET);

    const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
        path: '/api/v1/test'
    });
    const res = createMockResponse();
    const next = createMockNext();

    await authenticateToken(req, res, next);

    assert.equal(next.called, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Invalid token');

    User.findById = originalFindById;
});

test('JWT Middleware - non-existent user token is rejected', async () => {
    const originalFindById = User.findById;
    User.findById = (id) => ({
        select: () => ({
            lean: async () => null // User not found
        })
    });

    const token = jwt.sign({
        id: '507f1f77bcf86cd799439011',
        username: 'nonexistent',
        tokenVersion: 0
    }, JWT_SECRET);

    const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
        path: '/api/v1/test'
    });
    const res = createMockResponse();
    const next = createMockNext();

    await authenticateToken(req, res, next);

    assert.equal(next.called, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Invalid token');

    User.findById = originalFindById;
});

test('JWT Middleware - banned user token returns ban info', async () => {
    const testUser = createTestUser({
        _id: '507f1f77bcf86cd799439011',
        username: 'banneduser',
        tokenVersion: 0
    });

    const activeBan = createTestBan({
        userId: testUser._id,
        reason: 'Spamming',
        active: true,
        expirationTimestamp: new Date(Date.now() + 86400000) // 24 hours
    });

    const originalFindById = User.findById;
    const originalCheckExpired = Ban.checkExpired;
    const originalFindOne = Ban.findOne;

    User.findById = (id) => ({
        select: () => ({
            lean: async () => testUser
        })
    });

    Ban.checkExpired = async () => { };
    Ban.findOne = async (query) => {
        if (query.active === true) {
            return activeBan;
        }
        return null;
    };

    const token = jwt.sign({
        id: testUser._id,
        username: testUser.username,
        tokenVersion: 0
    }, JWT_SECRET);

    const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
        path: '/api/v1/test'
    });
    const res = createMockResponse();
    const next = createMockNext();

    await authenticateToken(req, res, next);

    assert.equal(next.called, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'Account banned');
    assert.ok(res.body.ban);
    assert.equal(res.body.ban.reason, 'Spamming');
    assert.ok(res.body.ban.expirationTimestamp);

    User.findById = originalFindById;
    Ban.checkExpired = originalCheckExpired;
    Ban.findOne = originalFindOne;
});

test('JWT Middleware - token without Bearer prefix is rejected', async () => {
    const token = jwt.sign({
        id: '507f1f77bcf86cd799439011',
        username: 'testuser',
        tokenVersion: 0
    }, JWT_SECRET);

    const req = createMockRequest({
        headers: { authorization: token }, // Missing "Bearer " prefix
        path: '/api/v1/test'
    });
    const res = createMockResponse();
    const next = createMockNext();

    await authenticateToken(req, res, next);

    assert.equal(next.called, false);
    assert.equal(res.statusCode, 401);
});

test('JWT Middleware - malformed authorization header is rejected', async () => {
    const req = createMockRequest({
        headers: { authorization: 'NotBearer token' },
        path: '/api/v1/test'
    });
    const res = createMockResponse();
    const next = createMockNext();

    await authenticateToken(req, res, next);

    assert.equal(next.called, false);
    assert.equal(res.statusCode, 401);
});
