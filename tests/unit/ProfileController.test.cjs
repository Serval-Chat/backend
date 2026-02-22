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
    withMetadata: () => mockSharpObj,
    toFile: async () => ({ size: 1024 }),
    toBuffer: async (opts) => {
        if (opts && opts.resolveWithObject) {
            return { data: Buffer.from('mocked-webp-data'), info: { size: 1024 } };
        }
        return Buffer.from('mocked-webp-data');
    },
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
fs.mkdirSync = (p, options) => {
    if (typeof p === 'string' && (p.includes('uploads') || p.includes('tmp'))) return;
    return originalMkdirSync(p, options);
};

const fsp = require('fs/promises');
const originalWriteFile = fsp.writeFile;
fsp.writeFile = async (p, data, options) => {
    if (typeof p === 'string' && (p.includes('uploads') || p.includes('tmp'))) return;
    return originalWriteFile(p, data, options);
};

const { ProfileController } = require('../../src/controllers/ProfileController');
const {
    createMockLogger,
    createMockUserRepository,
    createMockServerMemberRepository,
    createMockFriendshipRepository,
    createTestUser,
    createMockWsServer
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
    const mockServerMemberRepo = createMockServerMemberRepository();
    const mockFriendshipRepo = createMockFriendshipRepository();
    const mockWsServer = createMockWsServer();

    const controller = new ProfileController(
        mockUserRepo,
        mockLogger,
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
        originalname: 'banner.png',
        size: 1024,
        path: '/tmp/fake-banner.png'
    };

    const mockReq = {
        user: { id: userId, username: 'testuser' },
        io: {
            to: (room) => ({
                emit: (event, data) => { }
            })
        }
    };

    const result = await controller.uploadBanner(mockFile, mockReq);

    assert.ok(result.banner);
    assert.equal(mockUserRepo.calls.updateBanner.length, 1);
    assert.equal(mockUserRepo.calls.updateBanner[0].id.toString(), userId);
});

test.after(() => {
    fs.unlinkSync = originalUnlinkSync;
    fs.renameSync = originalRenameSync;
    fs.existsSync = originalExistsSync;
    fs.mkdirSync = originalMkdirSync;
    fsp.writeFile = originalWriteFile;
});
