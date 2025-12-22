/**
 * EmojiRepository Unit Tests
 */

require('ts-node/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const {
    createMockEmojiRepository,
    createTestEmoji
} = require('../utils/test-utils.cjs');

test('EmojiRepository - create emoji', async () => {
    const mockRepo = createMockEmojiRepository();
    const emojiData = {
        name: 'custom_smile',
        url: 'https://example.com/emojis/smile.png',
        serverId: new Types.ObjectId().toString()
    };

    const result = await mockRepo.create(emojiData);

    assert.equal(mockRepo.calls.create.length, 1);
    assert.ok(result._id);
    assert.equal(result.name, 'custom_smile');
});

test('EmojiRepository - delete emoji', async () => {
    const mockRepo = createMockEmojiRepository();
    const emojiId = new Types.ObjectId().toString();

    const result = await mockRepo.delete(emojiId);

    assert.equal(mockRepo.calls.delete.length, 1);
    assert.equal(result, true);
});

test('EmojiRepository - find global emojis', async () => {
    const mockRepo = createMockEmojiRepository();

    const globalEmojis = [
        createTestEmoji({ name: 'smile', global: true }),
        createTestEmoji({ name: 'heart', global: true })
    ];

    mockRepo.findGlobal = async () => {
        mockRepo.calls.findGlobal.push(true);
        return globalEmojis;
    };

    const result = await mockRepo.findGlobal();

    assert.equal(result.length, 2);
    assert.equal(result[0].global, true);
});

test('EmojiRepository - find emojis by server ID', async () => {
    const mockRepo = createMockEmojiRepository();
    const serverId = new Types.ObjectId().toString();

    const serverEmojis = [
        createTestEmoji({ serverId }),
        createTestEmoji({ serverId })
    ];

    mockRepo.findByServerId = async (sId) => {
        mockRepo.calls.findByServerId.push(sId);
        return serverEmojis;
    };

    const result = await mockRepo.findByServerId(serverId);

    assert.equal(result.length, 2);
});

test('EmojiRepository - find emoji by name', async () => {
    const mockRepo = createMockEmojiRepository();
    const serverId = new Types.ObjectId().toString();
    const emojiName = 'custom_emoji';
    const testEmoji = createTestEmoji({ name: emojiName, serverId });

    mockRepo.findByName = async (name, sId) => {
        mockRepo.calls.findByName.push({ name, serverId: sId });
        return name === emojiName ? testEmoji : null;
    };

    const result = await mockRepo.findByName(emojiName, serverId);

    assert.ok(result);
    assert.equal(result.name, emojiName);
});
