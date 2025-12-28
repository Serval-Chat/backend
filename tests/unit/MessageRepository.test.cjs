/**
 * MessageRepository Unit Tests
 * 
 * Tests for the message repository including create, find, update, and delete operations.
 */

require('ts-node/register');
require('tsconfig-paths/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const {
    createMockMessageRepository,
    createTestMessage
} = require('../utils/test-utils.cjs');

test('MessageRepository - create message without replyToId', async () => {
    const mockRepo = createMockMessageRepository();
    const messageData = {
        senderId: new Types.ObjectId().toString(),
        receiverId: new Types.ObjectId().toString(),
        text: 'Hello, this is a test message!'
    };

    const result = await mockRepo.create(messageData);

    assert.equal(mockRepo.calls.create.length, 1);
    assert.equal(mockRepo.calls.create[0].text, 'Hello, this is a test message!');
    assert.ok(result._id);
    assert.equal(result.text, messageData.text);
});

test('MessageRepository - create message with replyToId', async () => {
    const mockRepo = createMockMessageRepository();
    const replyToId = new Types.ObjectId().toString();
    const messageData = {
        senderId: new Types.ObjectId().toString(),
        receiverId: new Types.ObjectId().toString(),
        text: 'This is a reply',
        replyToId
    };

    const result = await mockRepo.create(messageData);

    assert.equal(mockRepo.calls.create.length, 1);
    assert.equal(mockRepo.calls.create[0].replyToId, replyToId);
    assert.equal(result.text, 'This is a reply');
});

test('MessageRepository - find messages by conversation with pagination', async () => {
    const mockRepo = createMockMessageRepository();
    const user1Id = new Types.ObjectId().toString();
    const user2Id = new Types.ObjectId().toString();

    // Mock returning messages
    const testMessages = [
        createTestMessage({ senderId: user1Id, receiverId: user2Id }),
        createTestMessage({ senderId: user2Id, receiverId: user1Id }),
        createTestMessage({ senderId: user1Id, receiverId: user2Id })
    ];

    mockRepo.findByConversation = async (u1, u2, limit, before) => {
        mockRepo.calls.findByConversation.push({ user1Id: u1, user2Id: u2, limit, before });
        return testMessages.slice(0, limit || testMessages.length);
    };

    const result = await mockRepo.findByConversation(user1Id, user2Id, 2);

    assert.equal(mockRepo.calls.findByConversation.length, 1);
    assert.equal(mockRepo.calls.findByConversation[0].limit, 2);
    assert.equal(result.length, 2);
});

test('MessageRepository - find messages by conversation with before parameter', async () => {
    const mockRepo = createMockMessageRepository();
    const user1Id = new Types.ObjectId().toString();
    const user2Id = new Types.ObjectId().toString();
    const beforeDate = new Date().toISOString();

    await mockRepo.findByConversation(user1Id, user2Id, 10, beforeDate);

    assert.equal(mockRepo.calls.findByConversation.length, 1);
    assert.equal(mockRepo.calls.findByConversation[0].before, beforeDate);
    assert.equal(mockRepo.calls.findByConversation[0].limit, 10);
});

test('MessageRepository - find message by ID', async () => {
    const mockRepo = createMockMessageRepository();
    const messageId = new Types.ObjectId().toString();
    const testMessage = createTestMessage({ _id: messageId });

    mockRepo.findById = async (id) => {
        mockRepo.calls.findById.push(id);
        return id === messageId ? testMessage : null;
    };

    const result = await mockRepo.findById(messageId);

    assert.equal(mockRepo.calls.findById.length, 1);
    assert.equal(mockRepo.calls.findById[0], messageId);
    assert.ok(result);
    assert.equal(result._id, messageId);
});

test('MessageRepository - update message text', async () => {
    const mockRepo = createMockMessageRepository();
    const messageId = new Types.ObjectId().toString();
    const updatedText = 'This message has been edited';

    const updatedMessage = createTestMessage({
        _id: messageId,
        text: updatedText,
        isEdited: true,
        editedAt: new Date()
    });

    mockRepo.update = async (id, text) => {
        mockRepo.calls.update.push({ id, text });
        return updatedMessage;
    };

    const result = await mockRepo.update(messageId, updatedText);

    assert.equal(mockRepo.calls.update.length, 1);
    assert.equal(mockRepo.calls.update[0].id, messageId);
    assert.equal(mockRepo.calls.update[0].text, updatedText);
    assert.ok(result);
    assert.equal(result.isEdited, true);
    assert.ok(result.editedAt);
});

test('MessageRepository - delete message', async () => {
    const mockRepo = createMockMessageRepository();
    const messageId = new Types.ObjectId().toString();

    const result = await mockRepo.delete(messageId);

    assert.equal(mockRepo.calls.delete.length, 1);
    assert.equal(mockRepo.calls.delete[0], messageId);
    assert.equal(result, true);
});

test('MessageRepository - find by conversation returns empty array when no messages', async () => {
    const mockRepo = createMockMessageRepository();
    const user1Id = new Types.ObjectId().toString();
    const user2Id = new Types.ObjectId().toString();

    const result = await mockRepo.findByConversation(user1Id, user2Id);

    assert.equal(mockRepo.calls.findByConversation.length, 1);
    assert.equal(result.length, 0);
});

test('MessageRepository - find by ID returns null when message not found', async () => {
    const mockRepo = createMockMessageRepository();
    const nonExistentId = new Types.ObjectId().toString();

    const result = await mockRepo.findById(nonExistentId);

    assert.equal(mockRepo.calls.findById.length, 1);
    assert.equal(result, null);
});
