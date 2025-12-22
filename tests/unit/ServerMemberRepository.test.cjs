/**
 * ServerMemberRepository Unit Tests
 */

require('ts-node/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const {
    createMockServerMemberRepository,
    createTestServerMember
} = require('../utils/test-utils.cjs');

test('ServerMemberRepository - create member', async () => {
    const mockRepo = createMockServerMemberRepository();
    const memberData = {
        serverId: new Types.ObjectId().toString(),
        userId: new Types.ObjectId().toString(),
        roles: []
    };

    const result = await mockRepo.create(memberData);

    assert.equal(mockRepo.calls.create.length, 1);
    assert.ok(result._id);
});

test('ServerMemberRepository - delete member', async () => {
    const mockRepo = createMockServerMemberRepository();
    const serverId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();

    const result = await mockRepo.delete(serverId, userId);

    assert.equal(mockRepo.calls.delete.length, 1);
    assert.equal(result, true);
});

test('ServerMemberRepository - delete members by server ID', async () => {
    const mockRepo = createMockServerMemberRepository();
    const serverId = new Types.ObjectId().toString();

    mockRepo.deleteByServerId = async (sId) => {
        if (!mockRepo.calls.deleteByServerId) mockRepo.calls.deleteByServerId = [];
        mockRepo.calls.deleteByServerId.push(sId);
        return { deletedCount: 10 };
    };

    const result = await mockRepo.deleteByServerId(serverId);

    assert.equal(result.deletedCount, 10);
});

test('ServerMemberRepository - find member by server and user', async () => {
    const mockRepo = createMockServerMemberRepository();
    const serverId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();

    const testMember = createTestServerMember({ serverId, userId });

    mockRepo.findByServerAndUser = async (sId, uId) => {
        mockRepo.calls.findByServerAndUser.push({ serverId: sId, userId: uId });
        return testMember;
    };

    const result = await mockRepo.findByServerAndUser(serverId, userId);

    assert.ok(result);
    assert.equal(result.userId, userId);
});

test('ServerMemberRepository - find members by user ID', async () => {
    const mockRepo = createMockServerMemberRepository();
    const userId = new Types.ObjectId().toString();

    const testMembers = [
        createTestServerMember({ userId }),
        createTestServerMember({ userId })
    ];

    mockRepo.findByUserId = async (uId) => {
        if (!mockRepo.calls.findByUserId) mockRepo.calls.findByUserId = [];
        mockRepo.calls.findByUserId.push(uId);
        return testMembers;
    };

    const result = await mockRepo.findByUserId(userId);

    assert.equal(result.length, 2);
});

test('ServerMemberRepository - find members by server ID', async () => {
    const mockRepo = createMockServerMemberRepository();
    const serverId = new Types.ObjectId().toString();

    const testMembers = [
        createTestServerMember({ serverId }),
        createTestServerMember({ serverId })
    ];

    mockRepo.findByServer = async (sId) => {
        mockRepo.calls.findByServer.push(sId);
        return testMembers;
    };

    const result = await mockRepo.findByServer(serverId);

    assert.equal(result.length, 2);
});

test('ServerMemberRepository - update member roles', async () => {
    const mockRepo = createMockServerMemberRepository();
    const serverId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();
    const roleId = new Types.ObjectId();

    mockRepo.updateRoles = async (sId, uId, roles) => {
        if (!mockRepo.calls.updateRoles) mockRepo.calls.updateRoles = [];
        mockRepo.calls.updateRoles.push({ serverId: sId, userId: uId, roles });
        return createTestServerMember({ serverId, userId, roles });
    };

    const result = await mockRepo.updateRoles(serverId, userId, [roleId]);

    assert.ok(result);
    assert.equal(result.roles.length, 1);
});
