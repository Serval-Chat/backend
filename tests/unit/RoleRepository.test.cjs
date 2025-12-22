/**
 * RoleRepository Unit Tests
 */

require('ts-node/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const {
    createMockRoleRepository,
    createTestRole
} = require('../utils/test-utils.cjs');

test('RoleRepository - create role', async () => {
    const mockRepo = createMockRoleRepository();
    const roleData = {
        serverId: new Types.ObjectId().toString(),
        name: 'Moderator',
        color: '#3498db',
        position: 1
    };

    const result = await mockRepo.create(roleData);

    assert.equal(mockRepo.calls.create.length, 1);
    assert.ok(result._id);
    assert.equal(result.name, 'Moderator');
});

test('RoleRepository - update role', async () => {
    const mockRepo = createMockRoleRepository();
    const roleId = new Types.ObjectId().toString();
    const updateData = {
        name: 'Admin',
        color: '#e74c3c',
        permissions: { administrator: true }
    };

    const updatedRole = createTestRole({
        _id: roleId,
        ...updateData
    });

    mockRepo.update = async (id, data) => {
        mockRepo.calls.update.push({ id, data });
        return updatedRole;
    };

    const result = await mockRepo.update(roleId, updateData);

    assert.equal(mockRepo.calls.update.length, 1);
    assert.equal(result.name, 'Admin');
});

test('RoleRepository - delete role', async () => {
    const mockRepo = createMockRoleRepository();
    const roleId = new Types.ObjectId().toString();

    const result = await mockRepo.delete(roleId);

    assert.equal(mockRepo.calls.delete.length, 1);
    assert.equal(result, true);
});

test('RoleRepository - delete roles by server ID', async () => {
    const mockRepo = createMockRoleRepository();
    const serverId = new Types.ObjectId().toString();

    mockRepo.deleteByServerId = async (sId) => {
        if (!mockRepo.calls.deleteByServerId) mockRepo.calls.deleteByServerId = [];
        mockRepo.calls.deleteByServerId.push(sId);
        return { deletedCount: 3 };
    };

    const result = await mockRepo.deleteByServerId(serverId);

    assert.equal(result.deletedCount, 3);
});

test('RoleRepository - find roles by server ID', async () => {
    const mockRepo = createMockRoleRepository();
    const serverId = new Types.ObjectId().toString();

    const testRoles = [
        createTestRole({ serverId, name: 'Member' }),
        createTestRole({ serverId, name: 'Moderator' })
    ];

    mockRepo.findByServerId = async (sId) => {
        mockRepo.calls.findByServerId.push(sId);
        return testRoles;
    };

    const result = await mockRepo.findByServerId(serverId);

    assert.equal(result.length, 2);
});

test('RoleRepository - update positions (bulk reorder)', async () => {
    const mockRepo = createMockRoleRepository();
    const updates = [
        { id: new Types.ObjectId().toString(), position: 0 },
        { id: new Types.ObjectId().toString(), position: 1 }
    ];

    mockRepo.updatePositions = async (upd) => {
        if (!mockRepo.calls.updatePositions) mockRepo.calls.updatePositions = [];
        mockRepo.calls.updatePositions.push(upd);
        return true;
    };

    const result = await mockRepo.updatePositions(updates);

    assert.equal(result, true);
});
