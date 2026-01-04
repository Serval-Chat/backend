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

// Mock PresenceService
function createMockPresenceService() {
    return {
        isUserOnline: () => true,
        getUserSockets: () => ['socket-1']
    };
}

const { setIO } = require('../../src/socket/index');
const emits = [];
const mockIO = {
    to: (room) => ({
        emit: (event, data) => {
            emits.push({ room, event, data });
            return mockIO;
        }
    })
};
setIO(mockIO);

test('ProfileController - uploadProfilePicture calls repository and emits event', async () => {
    const mockLogger = createMockLogger();
    const mockUserRepo = createMockUserRepository();
    const mockPresenceService = createMockPresenceService();
    const mockServerMemberRepo = createMockServerMemberRepository();
    const mockFriendshipRepo = createMockFriendshipRepository();

    const controller = new ProfileController(
        mockUserRepo,
        mockLogger,
        mockPresenceService,
        mockServerMemberRepo,
        mockFriendshipRepo
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

    // Check if event was emitted
    const userUpdateEmit = emits.find(e => e.event === 'user_updated');
    assert.ok(userUpdateEmit);
    assert.equal(userUpdateEmit.data.userId, userId);
    assert.equal(userUpdateEmit.data.profilePicture, result.profilePicture);
});

test.after(() => {
    fs.unlinkSync = originalUnlinkSync;
    fs.renameSync = originalRenameSync;
    fs.existsSync = originalExistsSync;
    fs.mkdirSync = originalMkdirSync;
});
