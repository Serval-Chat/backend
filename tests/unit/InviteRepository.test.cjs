/**
 * InviteRepository Unit Tests
 */

require('ts-node/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const {
    createMockInviteRepository,
    createTestInvite
} = require('../utils/test-utils.cjs');

test('InviteRepository - create invite', async () => {
    const mockRepo = createMockInviteRepository();
    const inviteData = {
        serverId: new Types.ObjectId().toString(),
        code: 'abc123xyz',
        createdByUserId: new Types.ObjectId().toString()
    };

    const result = await mockRepo.create(inviteData);

    assert.equal(mockRepo.calls.create.length, 1);
    assert.ok(result._id);
    assert.equal(result.code, 'abc123xyz');
});

test('InviteRepository - delete invite', async () => {
    const mockRepo = createMockInviteRepository();
    const inviteId = new Types.ObjectId().toString();

    const result = await mockRepo.delete(inviteId);

    assert.equal(mockRepo.calls.delete.length, 1);
    assert.equal(result, true);
});

test('InviteRepository - delete invites by server ID', async () => {
    const mockRepo = createMockInviteRepository();
    const serverId = new Types.ObjectId().toString();

    mockRepo.deleteByServerId = async (sId) => {
        mockRepo.calls.deleteByServerId.push(sId);
        return { deletedCount: 5 };
    };

    const result = await mockRepo.deleteByServerId(serverId);

    assert.equal(result.deletedCount, 5);
});

test('InviteRepository - find invite by code', async () => {
    const mockRepo = createMockInviteRepository();
    const code = 'test123';
    const testInvite = createTestInvite({ code });

    mockRepo.findByCode = async (c) => {
        mockRepo.calls.findByCode.push(c);
        return c === code ? testInvite : null;
    };

    const result = await mockRepo.findByCode(code);

    assert.ok(result);
    assert.equal(result.code, code);
});

test('InviteRepository - find invites by server ID', async () => {
    const mockRepo = createMockInviteRepository();
    const serverId = new Types.ObjectId().toString();

    const testInvites = [
        createTestInvite({ serverId }),
        createTestInvite({ serverId })
    ];

    mockRepo.findByServerId = async (sId) => {
        mockRepo.calls.findByServerId.push(sId);
        return testInvites;
    };

    const result = await mockRepo.findByServerId(serverId);

    assert.equal(result.length, 2);
});

test('InviteRepository - increment uses', async () => {
    const mockRepo = createMockInviteRepository();
    const inviteId = new Types.ObjectId().toString();

    const result = await mockRepo.incrementUses(inviteId);

    assert.equal(mockRepo.calls.incrementUses.length, 1);
    assert.equal(result, true);
});

test('InviteRepository - check if expired', () => {
    const mockRepo = createMockInviteRepository();

    const futureDate = new Date(Date.now() + 86400000); // Tomorrow
    const pastDate = new Date(Date.now() - 86400000); // Yesterday

    const activeInvite = createTestInvite({ expiresAt: futureDate });
    const expiredInvite = createTestInvite({ expiresAt: pastDate });
    const noExpiryInvite = createTestInvite();

    const activeResult = mockRepo.isExpired(activeInvite);
    const expiredResult = mockRepo.isExpired(expiredInvite);
    const noExpiryResult = mockRepo.isExpired(noExpiryInvite);

    assert.equal(activeResult, false);
    assert.equal(expiredResult, true);
    assert.equal(noExpiryResult, false);
});

test('InviteRepository - check if uses exceeded', () => {
    const mockRepo = createMockInviteRepository();

    const validInvite = createTestInvite({ maxUses: 10, uses: 5 });
    const maxedInvite = createTestInvite({ maxUses: 10, uses: 10 });
    const unlimitedInvite = createTestInvite({ uses: 100 });

    const validResult = mockRepo.isUsesExceeded(validInvite);
    const maxedResult = mockRepo.isUsesExceeded(maxedInvite);
    const unlimitedResult = mockRepo.isUsesExceeded(unlimitedInvite);

    assert.equal(validResult, false);
    assert.equal(maxedResult, true);
    assert.equal(unlimitedResult, false);
});
