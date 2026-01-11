/**
 * ProfileController Picture Upload Unit Tests
 */

require('ts-node/register');
require('tsconfig-paths/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const path = require('path');
const fs = require('fs');
const { randomBytes } = require('crypto');

// Mock sharp
const mockSharpObj = {
    resize: () => mockSharpObj,
    webp: () => mockSharpObj,
    toFile: async () => ({ size: 1024 }),
    toBuffer: async () => Buffer.from('mocked-webp-data'),
    metadata: async () => ({
        width: 512,
        height: 512,
        format: 'webp'
    })
};
const mockSharp = () => mockSharpObj;

require.cache[require.resolve('sharp')] = {
    exports: mockSharp
};

const originalUnlinkSync = fs.unlinkSync;
const originalRenameSync = fs.renameSync;
const originalExistsSync = fs.existsSync;
const originalMkdirSync = fs.mkdirSync;

fs.unlinkSync = (p) => {
    if (typeof p === 'string' && (p.includes('uploads') || p.includes('tmp'))) return;
    return originalUnlinkSync(p);
};
fs.renameSync = (oldPath, newPath) => {
    if (typeof oldPath === 'string' && (oldPath.includes('uploads') || oldPath.includes('tmp'))) return;
    return originalRenameSync(oldPath, newPath);
};
fs.existsSync = (p) => {
    if (typeof p === 'string' && (p.includes('uploads') || p.includes('tmp'))) return true;
    return originalExistsSync(p);
};
fs.mkdirSync = (p, options) => {
    if (typeof p === 'string' && (p.includes('uploads') || p.includes('tmp'))) return;
    return originalMkdirSync(p, options);
};

const { ProfileController } = require('../../src/controllers/ProfileController');
const {
    createMockLogger,
    createMockUserRepository,
    createMockServerMemberRepository,
    createMockFriendshipRepository,
    createTestUser
} = require('../utils/test-utils.cjs');

// Mock StatusService
function createMockStatusService() {
    return {
        getSubscribers: () => []
    };
}

// Mock WsServer
function createMockWsServer() {
    const broadcasts = [];
    return {
        broadcasts,
        broadcastToServer: (serverId, event) => {
            broadcasts.push({ type: 'server', target: serverId, event });
        },
        broadcastToUser: (userId, event) => {
            broadcasts.push({ type: 'user', target: userId, event });
        }
    };
}

test('ProfileController - uploadProfilePicture calls repository and emits event', async () => {
    const mockLogger = createMockLogger();
    const mockUserRepo = createMockUserRepository();
    const mockStatusService = createMockStatusService();
    const mockServerMemberRepo = createMockServerMemberRepository();
    const mockFriendshipRepo = createMockFriendshipRepository();
    const mockWsServer = createMockWsServer();

    const controller = new ProfileController(
        mockUserRepo,
        mockLogger,
        mockStatusService,
        mockServerMemberRepo,
        mockFriendshipRepo,
        mockWsServer
    );

    const userId = new Types.ObjectId().toString();
    const testUser = createTestUser({ _id: userId });

    mockUserRepo.findById = async () => testUser;
    mockServerMemberRepo.findServerIdsByUserId = async () => [new Types.ObjectId().toString()];
    mockFriendshipRepo.findAllByUserId = async () => [];

    const mockFile = {
        buffer: Buffer.from('fake-image-data'),
        mimetype: 'image/png',
        originalname: 'profile.png',
        size: 1024,
        path: '/tmp/fake-profile.png'
    };

    const mockReq = {
        user: { id: userId, username: 'testuser' }
    };

    const result = await controller.uploadProfilePicture(mockFile, mockReq);

    assert.ok(result.profilePicture);
    assert.equal(mockUserRepo.calls.updateProfilePicture.length, 1);
    assert.equal(mockUserRepo.calls.updateProfilePicture[0].id, userId);

    // Check if event was emitted via WsServer
    const userUpdateBroadcast = mockWsServer.broadcasts.find(b => b.event.type === 'user_updated' && b.type === 'user' && b.target === userId);
    assert.ok(userUpdateBroadcast);
    assert.equal(userUpdateBroadcast.event.payload.userId, userId);
    assert.equal(userUpdateBroadcast.event.payload.profilePicture, result.profilePicture);
});

test.after(() => {
    fs.unlinkSync = originalUnlinkSync;
    fs.renameSync = originalRenameSync;
    fs.existsSync = originalExistsSync;
    fs.mkdirSync = originalMkdirSync;
});
