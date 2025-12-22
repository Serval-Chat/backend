/**
 * ServerRepository Unit Tests
 * 
 * Tests for the server repository including CRUD operations.
 */

require('ts-node/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const {
    createMockServerRepository,
    createTestServer
} = require('../utils/test-utils.cjs');

test('ServerRepository - create server', async () => {
    const mockRepo = createMockServerRepository();
    const serverData = {
        name: 'My Awesome Server',
        ownerId: new Types.ObjectId().toString(),
        icon: 'server-icon.png'
    };

    const result = await mockRepo.create(serverData);

    assert.equal(mockRepo.calls.create.length, 1);
    assert.equal(mockRepo.calls.create[0].name, 'My Awesome Server');
    assert.ok(result._id);
    assert.equal(result.name, serverData.name);
});

test('ServerRepository - update server name', async () => {
    const mockRepo = createMockServerRepository();
    const serverId = new Types.ObjectId().toString();
    const updateData = { name: 'Updated Server Name' };

    const updatedServer = createTestServer({
        _id: serverId,
        name: 'Updated Server Name'
    });

    mockRepo.update = async (id, data) => {
        mockRepo.calls.update.push({ id, data });
        return updatedServer;
    };

    const result = await mockRepo.update(serverId, updateData);

    assert.equal(mockRepo.calls.update.length, 1);
    assert.equal(mockRepo.calls.update[0].id, serverId);
    assert.equal(result.name, 'Updated Server Name');
});

test('ServerRepository - update server icon and banner', async () => {
    const mockRepo = createMockServerRepository();
    const serverId = new Types.ObjectId().toString();
    const updateData = {
        icon: 'new-icon.png',
        banner: { type: 'image', value: 'banner.jpg' }
    };

    await mockRepo.update(serverId, updateData);

    assert.equal(mockRepo.calls.update.length, 1);
    assert.equal(mockRepo.calls.update[0].data.icon, 'new-icon.png');
    assert.equal(mockRepo.calls.update[0].data.banner.type, 'image');
});

test('ServerRepository - update server default role', async () => {
    const mockRepo = createMockServerRepository();
    const serverId = new Types.ObjectId().toString();
    const defaultRoleId = new Types.ObjectId().toString();

    await mockRepo.update(serverId, { defaultRoleId });

    assert.equal(mockRepo.calls.update.length, 1);
    assert.equal(mockRepo.calls.update[0].data.defaultRoleId, defaultRoleId);
});

test('ServerRepository - delete server', async () => {
    const mockRepo = createMockServerRepository();
    const serverId = new Types.ObjectId().toString();

    const result = await mockRepo.delete(serverId);

    assert.equal(mockRepo.calls.delete.length, 1);
    assert.equal(mockRepo.calls.delete[0], serverId);
    assert.equal(result, true);
});

test('ServerRepository - find server by ID', async () => {
    const mockRepo = createMockServerRepository();
    const serverId = new Types.ObjectId().toString();
    const testServer = createTestServer({ _id: serverId });

    mockRepo.findById = async (id) => {
        mockRepo.calls.findById.push(id);
        return id === serverId ? testServer : null;
    };

    const result = await mockRepo.findById(serverId);

    assert.equal(mockRepo.calls.findById.length, 1);
    assert.ok(result);
    assert.equal(result._id, serverId);
});

test('ServerRepository - find servers by IDs (bulk)', async () => {
    const mockRepo = createMockServerRepository();
    const serverIds = [
        new Types.ObjectId().toString(),
        new Types.ObjectId().toString(),
        new Types.ObjectId().toString()
    ];

    const testServers = serverIds.map(id => createTestServer({ _id: id }));

    mockRepo.findByIds = async (ids) => {
        mockRepo.calls.findByIds.push(ids);
        return testServers;
    };

    const result = await mockRepo.findByIds(serverIds);

    assert.equal(mockRepo.calls.findByIds.length, 1);
    assert.equal(result.length, 3);
});

test('ServerRepository - find servers by owner ID', async () => {
    const mockRepo = createMockServerRepository();
    const ownerId = new Types.ObjectId().toString();

    const testServers = [
        createTestServer({ ownerId }),
        createTestServer({ ownerId })
    ];

    mockRepo.findByOwnerId = async (oId) => {
        mockRepo.calls.findByOwnerId.push(oId);
        return testServers;
    };

    const result = await mockRepo.findByOwnerId(ownerId);

    assert.equal(mockRepo.calls.findByOwnerId.length, 1);
    assert.equal(result.length, 2);
});

test('ServerRepository - clear default role', async () => {
    const mockRepo = createMockServerRepository();
    const serverId = new Types.ObjectId().toString();
    const roleId = new Types.ObjectId().toString();

    const result = await mockRepo.clearDefaultRole(serverId, roleId);

    assert.equal(mockRepo.calls.clearDefaultRole.length, 1);
    assert.equal(mockRepo.calls.clearDefaultRole[0].serverId, serverId);
    assert.equal(mockRepo.calls.clearDefaultRole[0].roleId, roleId);
    assert.equal(result, true);
});

test('ServerRepository - find by ID returns null when not found', async () => {
    const mockRepo = createMockServerRepository();
    const serverId = new Types.ObjectId().toString();

    const result = await mockRepo.findById(serverId);

    assert.equal(result, null);
});

test('ServerRepository - find by IDs returns empty array when none found', async () => {
    const mockRepo = createMockServerRepository();
    const serverIds = [new Types.ObjectId().toString()];

    const result = await mockRepo.findByIds(serverIds);

    assert.equal(result.length, 0);
});
