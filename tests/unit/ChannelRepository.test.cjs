/**
 * ChannelRepository Unit Tests
 */

require('ts-node/register');
require('tsconfig-paths/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const {
    createMockChannelRepository,
    createTestChannel
} = require('../utils/test-utils.cjs');

test('ChannelRepository - create channel', async () => {
    const mockRepo = createMockChannelRepository();
    const channelData = {
        serverId: new Types.ObjectId().toString(),
        name: 'general-chat',
        type: 'text',
        position: 0
    };

    const result = await mockRepo.create(channelData);

    assert.equal(mockRepo.calls.create.length, 1);
    assert.ok(result._id);
    assert.equal(result.name, 'general-chat');
});

test('ChannelRepository - update channel', async () => {
    const mockRepo = createMockChannelRepository();
    const channelId = new Types.ObjectId().toString();
    const updateData = {
        name: 'announcements',
        position: 5,
        icon: '📢'
    };

    await mockRepo.update(channelId, updateData);

    assert.equal(mockRepo.calls.update.length, 1);
    assert.equal(mockRepo.calls.update[0].data.name, 'announcements');
    assert.equal(mockRepo.calls.update[0].data.position, 5);
});

test('ChannelRepository - delete channel', async () => {
    const mockRepo = createMockChannelRepository();
    const channelId = new Types.ObjectId().toString();

    const result = await mockRepo.delete(channelId);

    assert.equal(mockRepo.calls.delete.length, 1);
    assert.equal(result, true);
});

test('ChannelRepository - delete channels by server ID', async () => {
    const mockRepo = createMockChannelRepository();
    const serverId = new Types.ObjectId().toString();

    mockRepo.deleteByServerId = async (sId) => {
        mockRepo.calls.deleteByServerId.push(sId);
        return { deletedCount: 5 };
    };

    const result = await mockRepo.deleteByServerId(serverId);

    assert.equal(mockRepo.calls.deleteByServerId.length, 1);
    assert.equal(result.deletedCount, 5);
});

test('ChannelRepository - find channels by server ID', async () => {
    const mockRepo = createMockChannelRepository();
    const serverId = new Types.ObjectId().toString();

    const testChannels = [
        createTestChannel({ serverId, name: 'general' }),
        createTestChannel({ serverId, name: 'random' })
    ];

    mockRepo.findByServerId = async (sId) => {
        mockRepo.calls.findByServerId.push(sId);
        return testChannels;
    };

    const result = await mockRepo.findByServerId(serverId);

    assert.equal(result.length, 2);
});

test('ChannelRepository - find max position', async () => {
    const mockRepo = createMockChannelRepository();
    const serverId = new Types.ObjectId().toString();

    mockRepo.findMaxPosition = async (sId) => {
        mockRepo.calls.findMaxPosition.push(sId);
        return 10;
    };

    const result = await mockRepo.findMaxPosition(serverId);

    assert.equal(result, 10);
});
