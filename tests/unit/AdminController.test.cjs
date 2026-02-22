/**
 * AdminController Unit Tests
 */

require('ts-node/register');
require('tsconfig-paths/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const { AdminController } = require('../../src/controllers/AdminController');
const {
    createMockLogger,
    createMockUserRepository,
    createMockServerRepository,
    createMockBanRepository,
    createMockServerMemberRepository,
    createTestUser,
    createMockAuditLogRepository,
    createMockWsServer,
    createMockMessageRepository,
    createMockFriendshipRepository,
    createMockWarningRepository
} = require('../utils/test-utils.cjs');

test('AdminController - resetUserProfile resets banner', async () => {
    const mockLogger = createMockLogger();
    const mockUserRepo = createMockUserRepository();
    const mockAuditLogRepo = createMockAuditLogRepository();
    const mockFriendshipRepo = createMockFriendshipRepository();
    const mockWsServer = createMockWsServer();
    const mockBanRepo = createMockBanRepository();
    const mockServerRepo = createMockServerRepository();
    const mockMessageRepo = createMockMessageRepository();
    const mockWarningRepo = createMockWarningRepository();
    const mockServerMemberRepo = createMockServerMemberRepository();

    const controller = new AdminController(
        mockUserRepo,
        mockAuditLogRepo,
        mockFriendshipRepo,
        mockWsServer,
        mockLogger,
        mockBanRepo,
        mockServerRepo,
        mockMessageRepo,
        mockWarningRepo,
        mockServerMemberRepo
    );

    const userId = new Types.ObjectId().toString();
    const testUser = createTestUser({ _id: new Types.ObjectId(userId), banner: 'old-banner.png' });

    mockUserRepo.findById = async () => testUser;
    mockUserRepo.update = async (id, data) => {
        mockUserRepo.calls.update.push({ id, data });
        return { ...testUser, ...data };
    };

    const mockReq = {
        user: { id: new Types.ObjectId().toString() },
        ip: '127.0.0.1'
    };

    const result = await controller.resetUserProfile(userId, { fields: ['banner'] }, mockReq);

    assert.equal(mockUserRepo.calls.update.length, 1);
    assert.equal(mockUserRepo.calls.update[0].id.toString(), userId);
    assert.strictEqual(mockUserRepo.calls.update[0].data.banner, null);
    assert.equal(result.message, 'User profile fields reset');
});
