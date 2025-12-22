/**
 * AuthService Unit Tests
 * 
 * Tests for the authentication service including login, password validation,
 * ban checking, and IP tracking.
 */

require('ts-node/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const { AuthService } = require('../../src/services/AuthService');
const {
    createMockLogger,
    createMockUserRepository,
    createMockBanRepository,
    createTestUser,
    createTestBan
} = require('../utils/test-utils.cjs');

test('AuthService - login with valid username credentials', async () => {
    const mockLogger = createMockLogger();
    const mockUserRepo = createMockUserRepository();
    const mockBanRepo = createMockBanRepository();

    const testUser = createTestUser({ username: 'validuser', login: 'validuser' });

    // Mock successful user lookup
    mockUserRepo.findByLogin = async (login) => {
        mockUserRepo.calls.findByLogin.push(login);
        return testUser;
    };

    // Mock successful password comparison
    mockUserRepo.comparePassword = async (id, password) => {
        mockUserRepo.calls.comparePassword.push({ id, password });
        return true;
    };

    const authService = new AuthService(mockLogger, mockUserRepo, mockBanRepo);
    const result = await authService.login('validuser', 'correctpassword');

    assert.equal(result.success, true);
    assert.equal(result.user._id, testUser._id);
    assert.equal(result.user.username, 'validuser');
    assert.equal(result.error, undefined);
    assert.equal(mockUserRepo.calls.findByLogin.length, 1);
    assert.equal(mockUserRepo.calls.comparePassword.length, 1);
    assert.equal(mockBanRepo.calls.checkExpired.length, 1);
});

test('AuthService - login with valid email credentials', async () => {
    const mockLogger = createMockLogger();
    const mockUserRepo = createMockUserRepository();
    const mockBanRepo = createMockBanRepository();

    const testUser = createTestUser({
        username: 'testuser',
        login: 'testuser',
        email: 'test@example.com'
    });

    mockUserRepo.findByLogin = async (login) => {
        mockUserRepo.calls.findByLogin.push(login);
        return testUser;
    };

    mockUserRepo.comparePassword = async () => true;

    const authService = new AuthService(mockLogger, mockUserRepo, mockBanRepo);
    const result = await authService.login('test@example.com', 'password123');

    assert.equal(result.success, true);
    assert.equal(result.user.email, 'test@example.com');
});

test('AuthService - login with invalid password', async () => {
    const mockLogger = createMockLogger();
    const mockUserRepo = createMockUserRepository();
    const mockBanRepo = createMockBanRepository();

    const testUser = createTestUser();

    mockUserRepo.findByLogin = async () => testUser;
    mockUserRepo.comparePassword = async () => false; // Invalid password

    const authService = new AuthService(mockLogger, mockUserRepo, mockBanRepo);
    const result = await authService.login('testuser', 'wrongpassword');

    assert.equal(result.success, false);
    assert.equal(result.error, 'Invalid credentials');
    assert.equal(result.user, undefined);
});

test('AuthService - login with non-existent user', async () => {
    const mockLogger = createMockLogger();
    const mockUserRepo = createMockUserRepository();
    const mockBanRepo = createMockBanRepository();

    let findByLoginCalled = 0;
    mockUserRepo.findByLogin = async () => {
        findByLoginCalled++;
        return null; // User not found
    };

    const authService = new AuthService(mockLogger, mockUserRepo, mockBanRepo);
    const result = await authService.login('nonexistent', 'password');

    assert.equal(result.success, false);
    assert.equal(result.error, 'Invalid credentials');
    assert.equal(findByLoginCalled, 1);
    // Should not check password if user doesn't exist
    assert.equal(mockUserRepo.calls.comparePassword.length, 0);
});

test('AuthService - login with soft-deleted account', async () => {
    const mockLogger = createMockLogger();
    const mockUserRepo = createMockUserRepository();
    const mockBanRepo = createMockBanRepository();

    const deletedUser = createTestUser({
        deletedAt: new Date(),
        anonymizedUsername: 'deleted-user-12345'
    });

    mockUserRepo.findByLogin = async () => deletedUser;

    const authService = new AuthService(mockLogger, mockUserRepo, mockBanRepo);
    const result = await authService.login('testuser', 'password');

    assert.equal(result.success, false);
    assert.equal(result.error, 'Invalid credentials');
    // Should not check password for deleted accounts
    assert.equal(mockUserRepo.calls.comparePassword.length, 0);
});

test('AuthService - login with banned account (permanent ban)', async () => {
    const mockLogger = createMockLogger();
    const mockUserRepo = createMockUserRepository();
    const mockBanRepo = createMockBanRepository();

    const testUser = createTestUser();
    const activeBan = createTestBan({
        userId: testUser._id,
        reason: 'Violation of terms of service',
        active: true
        // No expirationTimestamp = permanent ban
    });

    mockUserRepo.findByLogin = async () => testUser;
    mockUserRepo.comparePassword = async () => true;
    mockBanRepo.findActiveByUserId = async (userId) => {
        mockBanRepo.calls.findActiveByUserId.push(userId);
        return activeBan;
    };

    const authService = new AuthService(mockLogger, mockUserRepo, mockBanRepo);
    const result = await authService.login('testuser', 'password');

    assert.equal(result.success, false);
    assert.equal(result.error, 'Your account has been banned');
    assert.equal(result.ban.reason, 'Violation of terms of service');
    assert.equal(result.ban.expirationTimestamp, undefined); // Permanent ban
    assert.equal(mockBanRepo.calls.checkExpired.length, 1);
    assert.equal(mockBanRepo.calls.findActiveByUserId.length, 1);
});

test('AuthService - login with banned account (temporary ban)', async () => {
    const mockLogger = createMockLogger();
    const mockUserRepo = createMockUserRepository();
    const mockBanRepo = createMockBanRepository();

    const testUser = createTestUser();
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    const activeBan = createTestBan({
        userId: testUser._id,
        reason: 'Spamming',
        active: true,
        expirationTimestamp: futureDate
    });

    mockUserRepo.findByLogin = async () => testUser;
    mockUserRepo.comparePassword = async () => true;
    mockBanRepo.findActiveByUserId = async () => activeBan;

    const authService = new AuthService(mockLogger, mockUserRepo, mockBanRepo);
    const result = await authService.login('testuser', 'password');

    assert.equal(result.success, false);
    assert.equal(result.error, 'Your account has been banned');
    assert.equal(result.ban.reason, 'Spamming');
    assert.ok(result.ban.expirationTimestamp);
    assert.equal(result.ban.expirationTimestamp.getTime(), futureDate.getTime());
});

test('AuthService - login calls ban expiration check', async () => {
    const mockLogger = createMockLogger();
    const mockUserRepo = createMockUserRepository();
    const mockBanRepo = createMockBanRepository();

    const testUser = createTestUser();

    mockUserRepo.findByLogin = async () => testUser;
    mockUserRepo.comparePassword = async () => true;

    const authService = new AuthService(mockLogger, mockUserRepo, mockBanRepo);
    await authService.login('testuser', 'password');

    // Verify checkExpired was called before findActiveByUserId
    assert.equal(mockBanRepo.calls.checkExpired.length, 1);
    assert.equal(mockBanRepo.calls.checkExpired[0], testUser._id.toString());
});

test('AuthService - login without active ban succeeds', async () => {
    const mockLogger = createMockLogger();
    const mockUserRepo = createMockUserRepository();
    const mockBanRepo = createMockBanRepository();

    const testUser = createTestUser();

    mockUserRepo.findByLogin = async () => testUser;
    mockUserRepo.comparePassword = async () => true;
    mockBanRepo.findActiveByUserId = async () => null; // No active ban

    const authService = new AuthService(mockLogger, mockUserRepo, mockBanRepo);
    const result = await authService.login('testuser', 'password');

    assert.equal(result.success, true);
    assert.equal(result.user._id, testUser._id);
    assert.equal(result.ban, undefined);
});

test('AuthService - login calls repository methods in correct order', async () => {
    const mockLogger = createMockLogger();
    const mockUserRepo = createMockUserRepository();
    const mockBanRepo = createMockBanRepository();

    const callOrder = [];
    const testUser = createTestUser();

    mockUserRepo.findByLogin = async () => {
        callOrder.push('findByLogin');
        return testUser;
    };

    mockUserRepo.comparePassword = async () => {
        callOrder.push('comparePassword');
        return true;
    };

    mockBanRepo.checkExpired = async () => {
        callOrder.push('checkExpired');
    };

    mockBanRepo.findActiveByUserId = async () => {
        callOrder.push('findActiveByUserId');
        return null;
    };

    const authService = new AuthService(mockLogger, mockUserRepo, mockBanRepo);
    await authService.login('testuser', 'password');

    assert.deepEqual(callOrder, [
        'findByLogin',
        'comparePassword',
        'checkExpired',
        'findActiveByUserId'
    ]);
});
