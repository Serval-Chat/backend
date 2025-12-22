/**
 * FriendshipRepository Unit Tests
 * 
 * Tests for the friendship repository including friend management and friend requests.
 */

require('ts-node/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const {
    createMockFriendshipRepository,
    createTestFriendship,
    createTestFriendRequest
} = require('../utils/test-utils.cjs');

test('FriendshipRepository - create friendship', async () => {
    const mockRepo = createMockFriendshipRepository();
    const user1Id = new Types.ObjectId().toString();
    const user2Id = new Types.ObjectId().toString();

    const result = await mockRepo.create(user1Id, user2Id);

    assert.equal(mockRepo.calls.create.length, 1);
    assert.equal(mockRepo.calls.create[0].userId, user1Id);
    assert.equal(mockRepo.calls.create[0].friendId, user2Id);
    assert.ok(result._id);
});

test('FriendshipRepository - remove friendship (bidirectional)', async () => {
    const mockRepo = createMockFriendshipRepository();
    const user1Id = new Types.ObjectId().toString();
    const user2Id = new Types.ObjectId().toString();

    const result = await mockRepo.remove(user1Id, user2Id);

    assert.equal(mockRepo.calls.remove.length, 1);
    assert.equal(mockRepo.calls.remove[0].userId, user1Id);
    assert.equal(mockRepo.calls.remove[0].friendId, user2Id);
    assert.equal(result, true);
});

test('FriendshipRepository - check if users are friends (returns true)', async () => {
    const mockRepo = createMockFriendshipRepository();
    const user1Id = new Types.ObjectId().toString();
    const user2Id = new Types.ObjectId().toString();

    const result = await mockRepo.areFriends(user1Id, user2Id);

    assert.equal(mockRepo.calls.areFriends.length, 1);
    assert.equal(mockRepo.calls.areFriends[0].user1Id, user1Id);
    assert.equal(mockRepo.calls.areFriends[0].user2Id, user2Id);
    assert.equal(result, true);
});

test('FriendshipRepository - check if users are friends (returns false)', async () => {
    const mockRepo = createMockFriendshipRepository();
    const user1Id = new Types.ObjectId().toString();
    const user2Id = new Types.ObjectId().toString();

    mockRepo.areFriends = async (u1, u2) => {
        mockRepo.calls.areFriends.push({ user1Id: u1, user2Id: u2 });
        return false; // Not friends
    };

    const result = await mockRepo.areFriends(user1Id, user2Id);

    assert.equal(result, false);
});

test('FriendshipRepository - find friendships by user ID', async () => {
    const mockRepo = createMockFriendshipRepository();
    const userId = new Types.ObjectId().toString();

    const testFriendships = [
        createTestFriendship({ userId }),
        createTestFriendship({ userId }),
        createTestFriendship({ userId })
    ];

    mockRepo.findByUserId = async (uid) => {
        mockRepo.calls.findByUserId.push(uid);
        return testFriendships;
    };

    const result = await mockRepo.findByUserId(userId);

    assert.equal(mockRepo.calls.findByUserId.length, 1);
    assert.equal(mockRepo.calls.findByUserId[0], userId);
    assert.equal(result.length, 3);
});

test('FriendshipRepository - create friend request', async () => {
    const mockRepo = createMockFriendshipRepository();
    const fromId = new Types.ObjectId().toString();
    const toId = new Types.ObjectId().toString();

    const result = await mockRepo.createRequest(fromId, toId);

    assert.equal(mockRepo.calls.createRequest.length, 1);
    assert.equal(mockRepo.calls.createRequest[0].fromId, fromId);
    assert.equal(mockRepo.calls.createRequest[0].toId, toId);
    assert.ok(result._id);
    assert.equal(result.status, 'pending');
});

test('FriendshipRepository - accept friend request', async () => {
    const mockRepo = createMockFriendshipRepository();
    const requestId = new Types.ObjectId().toString();

    const result = await mockRepo.acceptRequest(requestId);

    assert.equal(mockRepo.calls.acceptRequest.length, 1);
    assert.equal(mockRepo.calls.acceptRequest[0], requestId);
    assert.ok(result);
    assert.equal(result.status, 'accepted');
});

test('FriendshipRepository - reject friend request', async () => {
    const mockRepo = createMockFriendshipRepository();
    const requestId = new Types.ObjectId().toString();

    const result = await mockRepo.rejectRequest(requestId);

    assert.equal(mockRepo.calls.rejectRequest.length, 1);
    assert.equal(mockRepo.calls.rejectRequest[0], requestId);
    assert.equal(result, true);
});

test('FriendshipRepository - find pending requests for user', async () => {
    const mockRepo = createMockFriendshipRepository();
    const userId = new Types.ObjectId().toString();

    const testRequests = [
        createTestFriendRequest({ toId: userId, status: 'pending' }),
        createTestFriendRequest({ toId: userId, status: 'pending' })
    ];

    mockRepo.findPendingRequestsFor = async (uid) => {
        mockRepo.calls.findPendingRequestsFor.push(uid);
        return testRequests;
    };

    const result = await mockRepo.findPendingRequestsFor(userId);

    assert.equal(mockRepo.calls.findPendingRequestsFor.length, 1);
    assert.equal(mockRepo.calls.findPendingRequestsFor[0], userId);
    assert.equal(result.length, 2);
    assert.equal(result[0].status, 'pending');
});

test('FriendshipRepository - find existing request between users', async () => {
    const mockRepo = createMockFriendshipRepository();
    const fromId = new Types.ObjectId().toString();
    const toId = new Types.ObjectId().toString();

    const existingRequest = createTestFriendRequest({ fromId, toId, status: 'pending' });

    mockRepo.findExistingRequest = async (fId, tId) => {
        mockRepo.calls.findExistingRequest.push({ fromId: fId, toId: tId });
        return existingRequest;
    };

    const result = await mockRepo.findExistingRequest(fromId, toId);

    assert.equal(mockRepo.calls.findExistingRequest.length, 1);
    assert.ok(result);
    assert.equal(result.status, 'pending');
});

test('FriendshipRepository - find request by ID', async () => {
    const mockRepo = createMockFriendshipRepository();
    const requestId = new Types.ObjectId().toString();

    const testRequest = createTestFriendRequest({ _id: requestId });

    mockRepo.findRequestById = async (reqId) => {
        mockRepo.calls.findRequestById.push(reqId);
        return reqId === requestId ? testRequest : null;
    };

    const result = await mockRepo.findRequestById(requestId);

    assert.equal(mockRepo.calls.findRequestById.length, 1);
    assert.ok(result);
    assert.equal(result._id, requestId);
});

test('FriendshipRepository - find request between users', async () => {
    const mockRepo = createMockFriendshipRepository();
    const fromId = new Types.ObjectId().toString();
    const toId = new Types.ObjectId().toString();

    const testRequest = createTestFriendRequest({ fromId, toId, status: 'pending' });

    mockRepo.findRequestBetweenUsers = async (fId, tId) => {
        mockRepo.calls.findRequestBetweenUsers.push({ fromId: fId, toId: tId });
        return testRequest;
    };

    const result = await mockRepo.findRequestBetweenUsers(fromId, toId);

    assert.equal(mockRepo.calls.findRequestBetweenUsers.length, 1);
    assert.ok(result);
    assert.equal(result.fromId.toString(), fromId);
    assert.equal(result.toId.toString(), toId);
});

test('FriendshipRepository - find pending requests returns empty array when none', async () => {
    const mockRepo = createMockFriendshipRepository();
    const userId = new Types.ObjectId().toString();

    const result = await mockRepo.findPendingRequestsFor(userId);

    assert.equal(mockRepo.calls.findPendingRequestsFor.length, 1);
    assert.equal(result.length, 0);
});

test('FriendshipRepository - find existing request returns null when not found', async () => {
    const mockRepo = createMockFriendshipRepository();
    const fromId = new Types.ObjectId().toString();
    const toId = new Types.ObjectId().toString();

    const result = await mockRepo.findExistingRequest(fromId, toId);

    assert.equal(mockRepo.calls.findExistingRequest.length, 1);
    assert.equal(result, null);
});

test('FriendshipRepository - find friendships returns empty array when user has no friends', async () => {
    const mockRepo = createMockFriendshipRepository();
    const userId = new Types.ObjectId().toString();

    const result = await mockRepo.findByUserId(userId);

    assert.equal(mockRepo.calls.findByUserId.length, 1);
    assert.equal(result.length, 0);
});
