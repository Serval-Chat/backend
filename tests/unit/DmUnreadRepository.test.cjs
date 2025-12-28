/**
 * DmUnreadRepository Unit Tests
 * 
 * Tests for the DM unread counter repository.
 */

require('ts-node/register');
require('tsconfig-paths/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const {
    createMockDmUnreadRepository,
    createTestDmUnread
} = require('../utils/test-utils.cjs');

test('DmUnreadRepository - increment unread count', async () => {
    const mockRepo = createMockDmUnreadRepository();
    const userId = new Types.ObjectId().toString();
    const peerId = new Types.ObjectId().toString();

    await mockRepo.increment(userId, peerId);

    assert.equal(mockRepo.calls.increment.length, 1);
    assert.equal(mockRepo.calls.increment[0].userId, userId);
    assert.equal(mockRepo.calls.increment[0].peerId, peerId);
});

test('DmUnreadRepository - reset unread count', async () => {
    const mockRepo = createMockDmUnreadRepository();
    const userId = new Types.ObjectId().toString();
    const peerId = new Types.ObjectId().toString();

    await mockRepo.reset(userId, peerId);

    assert.equal(mockRepo.calls.reset.length, 1);
    assert.equal(mockRepo.calls.reset[0].userId, userId);
    assert.equal(mockRepo.calls.reset[0].peerId, peerId);
});

test('DmUnreadRepository - find unread counts for user', async () => {
    const mockRepo = createMockDmUnreadRepository();
    const userId = new Types.ObjectId().toString();

    const testUnreads = [
        createTestDmUnread({ user: userId, count: 3 }),
        createTestDmUnread({ user: userId, count: 7 }),
        createTestDmUnread({ user: userId, count: 1 })
    ];

    mockRepo.findByUser = async (uid) => {
        mockRepo.calls.findByUser.push(uid);
        return testUnreads;
    };

    const result = await mockRepo.findByUser(userId);

    assert.equal(mockRepo.calls.findByUser.length, 1);
    assert.equal(mockRepo.calls.findByUser[0], userId);
    assert.equal(result.length, 3);
    assert.equal(result[0].count, 3);
    assert.equal(result[1].count, 7);
});

test('DmUnreadRepository - find by user and peer', async () => {
    const mockRepo = createMockDmUnreadRepository();
    const userId = new Types.ObjectId().toString();
    const peerId = new Types.ObjectId().toString();

    const testUnread = createTestDmUnread({ user: userId, peer: peerId, count: 5 });

    mockRepo.findByUserAndPeer = async (uid, pid) => {
        mockRepo.calls.findByUserAndPeer.push({ userId: uid, peerId: pid });
        return testUnread;
    };

    const result = await mockRepo.findByUserAndPeer(userId, peerId);

    assert.equal(mockRepo.calls.findByUserAndPeer.length, 1);
    assert.equal(mockRepo.calls.findByUserAndPeer[0].userId, userId);
    assert.equal(mockRepo.calls.findByUserAndPeer[0].peerId, peerId);
    assert.ok(result);
    assert.equal(result.count, 5);
});

test('DmUnreadRepository - find by user returns empty array when no unreads', async () => {
    const mockRepo = createMockDmUnreadRepository();
    const userId = new Types.ObjectId().toString();

    const result = await mockRepo.findByUser(userId);

    assert.equal(mockRepo.calls.findByUser.length, 1);
    assert.equal(result.length, 0);
});

test('DmUnreadRepository - find by user and peer returns null when no unread', async () => {
    const mockRepo = createMockDmUnreadRepository();
    const userId = new Types.ObjectId().toString();
    const peerId = new Types.ObjectId().toString();

    const result = await mockRepo.findByUserAndPeer(userId, peerId);

    assert.equal(mockRepo.calls.findByUserAndPeer.length, 1);
    assert.equal(result, null);
});

test('DmUnreadRepository - multiple increment calls tracked correctly', async () => {
    const mockRepo = createMockDmUnreadRepository();
    const userId = new Types.ObjectId().toString();
    const peer1Id = new Types.ObjectId().toString();
    const peer2Id = new Types.ObjectId().toString();

    await mockRepo.increment(userId, peer1Id);
    await mockRepo.increment(userId, peer2Id);
    await mockRepo.increment(userId, peer1Id);

    assert.equal(mockRepo.calls.increment.length, 3);
    assert.equal(mockRepo.calls.increment[0].peerId, peer1Id);
    assert.equal(mockRepo.calls.increment[1].peerId, peer2Id);
    assert.equal(mockRepo.calls.increment[2].peerId, peer1Id);
});
