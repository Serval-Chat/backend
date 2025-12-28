/**
 * ProfileController Unit Tests
 */

require('ts-node/register');
require('tsconfig-paths/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');

// Mock sharp
const mockSharpObj = {
    resize: () => mockSharpObj,
    webp: () => mockSharpObj,
    toFile: async () => ({ size: 1024 }),
    toBuffer: async () => Buffer.from('mocked-webp-data'),
    metadata: async () => ({
        width: 800,
        height: 300,
        format: 'webp'
    })
};
const mockSharp = () => mockSharpObj;

require.cache[require.resolve('sharp')] = {
    exports: mockSharp
};

const fs = require('fs');
const originalUnlinkSync = fs.unlinkSync;
const originalRenameSync = fs.renameSync;
const originalExistsSync = fs.existsSync;
const originalMkdirSync = fs.mkdirSync;

fs.unlinkSync = (path) => {
    if (typeof path === 'string' && (path.includes('uploads') || path.includes('tmp'))) return;
    return originalUnlinkSync(path);
};
fs.renameSync = (oldPath, newPath) => {
    if (typeof oldPath === 'string' && (oldPath.includes('uploads') || oldPath.includes('tmp'))) return;
    return originalRenameSync(oldPath, newPath);
};
fs.existsSync = (path) => {
    if (typeof path === 'string' && (path.includes('uploads') || path.includes('tmp'))) return true;
    return originalExistsSync(path);
};
fs.mkdirSync = (path, options) => {
    if (typeof path === 'string' && (path.includes('uploads') || path.includes('tmp'))) return;
    return originalMkdirSync(path, options);
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
    const calls = {
        isUserOnline: [],
        getUserSockets: []
    };
    return {
        calls,
        isUserOnline: (userId) => {
            calls.isUserOnline.push(userId);
            return true;
        },
        getUserSockets: (userId) => {
            calls.getUserSockets.push(userId);
            return ['socket-1'];
        }
    };
}

test('ProfileController - uploadBanner calls repository and presence service', async () => {
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
        originalname: 'banner.png',
        size: 1024,
        path: '/tmp/fake-banner.png'
    };

    const mockReq = {
        user: { id: userId },
        io: {
            to: (room) => ({
                emit: (event, data) => {
                    // Track emits if needed
                }
            })
        }
    };

    // We need to mock the sharp processing or just the file system if it was used
    // But ProfileController uses sharp. For unit tests, we might need to mock sharp.
    // However, since we are running in a node environment with ts-node, 
    // we can try to run it and see if it works or if we need to mock sharp.

    const result = await controller.uploadBanner(mockFile, mockReq);

    assert.ok(result.banner);
    assert.equal(mockUserRepo.calls.updateBanner.length, 1);
    assert.equal(mockUserRepo.calls.updateBanner[0].id, userId);
});

test.after(() => {
    fs.unlinkSync = originalUnlinkSync;
    fs.renameSync = originalRenameSync;
    fs.existsSync = originalExistsSync;
    fs.mkdirSync = originalMkdirSync;
});
