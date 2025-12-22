/**
 * ServerMessageRepository Unit Tests
 */

require('ts-node/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const {
    createMockServerMessageRepository,
    createTestServerMessage
} = require('../utils/test-utils.cjs');

test('ServerMessageRepository - create message', async () => {
    const mockRepo = createMockServerMessageRepository();
    const messageData = {
        serverId: new Types.ObjectId().toString(),
        channelId: new Types.ObjectId().toString(),
        senderId: new Types.ObjectId().toString(),
        text: 'Hello server!'
    };

    const result = await mockRepo.create(messageData);

    assert.equal(mockRepo.calls.create.length, 1);
    assert.ok(result._id);
    assert.equal(result.text, 'Hello server!');
});

test('ServerMessageRepository - update message', async () => {
    const mockRepo = createMockServerMessageRepository();
    const messageId = new Types.ObjectId().toString();
    const newText = 'Updated message text';

    await mockRepo.update(messageId, newText);

    assert.equal(mockRepo.calls.update.length, 1);
    assert.equal(mockRepo.calls.update[0].text, newText);
});

test('ServerMessageRepository - delete message', async () => {
    const mockRepo = createMockServerMessageRepository();
    const messageId = new Types.ObjectId().toString();

    const result = await mockRepo.delete(messageId);

    assert.equal(mockRepo.calls.delete.length, 1);
    assert.equal(result, true);
});

test('ServerMessageRepository - delete by channel ID', async () => {
    const mockRepo = createMockServerMessageRepository();
    const channelId = new Types.ObjectId().toString();

    mockRepo.deleteByChannelId = async (chId) => {
        mockRepo.calls.deleteByChannelId.push(chId);
        return { deletedCount: 25 };
    };

    const result = await mockRepo.deleteByChannelId(channelId);

    assert.equal(result.deletedCount, 25);
});

test('ServerMessageRepository - delete by server ID', async () => {
    const mockRepo = createMockServerMessageRepository();
    const serverId = new Types.ObjectId().toString();

    mockRepo.deleteByServerId = async (sId) => {
        mockRepo.calls.deleteByServerId.push(sId);
        return { deletedCount: 100 };
    };

    const result = await mockRepo.deleteByServerId(serverId);

    assert.equal(result.deletedCount, 100);
});

test('ServerMessageRepository - find messages by channel', async () => {
    const mockRepo = createMockServerMessageRepository();
    const channelId = new Types.ObjectId().toString();

    const testMessages = [
        createTestServerMessage({ channelId, text: 'Message 1' }),
        createTestServerMessage({ channelId, text: 'Message 2' })
    ];

    mockRepo.findByChannel = async (chId, limit, before) => {
        mockRepo.calls.findByChannel.push({ channelId: chId, limit, before });
        return testMessages;
    };

    const result = await mockRepo.findByChannel(channelId, 50, null);

    assert.equal(result.length, 2);
    assert.equal(mockRepo.calls.findByChannel[0].limit, 50);
});

test('ServerMessageRepository - find message by ID', async () => {
    const mockRepo = createMockServerMessageRepository();
    const messageId = new Types.ObjectId().toString();
    const testMessage = createTestServerMessage({ _id: messageId });

    mockRepo.findById = async (id) => {
        mockRepo.calls.findById.push(id);
        return id === messageId ? testMessage : null;
    };

    const result = await mockRepo.findById(messageId);

    assert.ok(result);
    assert.equal(result._id, messageId);
});
