/**
 * CategoryRepository Unit Tests
 */

require('ts-node/register');
require('tsconfig-paths/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const {
    createMockCategoryRepository,
    createTestCategory
} = require('../utils/test-utils.cjs');

test('CategoryRepository - create category', async () => {
    const mockRepo = createMockCategoryRepository();
    const categoryData = {
        serverId: new Types.ObjectId().toString(),
        name: 'Text Channels',
        position: 0
    };

    const result = await mockRepo.create(categoryData);

    assert.equal(mockRepo.calls.create.length, 1);
    assert.ok(result._id);
    assert.equal(result.name, 'Text Channels');
});

test('CategoryRepository - update category', async () => {
    const mockRepo = createMockCategoryRepository();
    const categoryId = new Types.ObjectId().toString();
    const updateData = {
        name: 'Voice Channels',
        position: 2
    };

    await mockRepo.update(categoryId, updateData);

    assert.equal(mockRepo.calls.update.length, 1);
    assert.equal(mockRepo.calls.update[0].data.name, 'Voice Channels');
});

test('CategoryRepository - delete category', async () => {
    const mockRepo = createMockCategoryRepository();
    const categoryId = new Types.ObjectId().toString();

    const result = await mockRepo.delete(categoryId);

    assert.equal(mockRepo.calls.delete.length, 1);
    assert.equal(result, true);
});

test('CategoryRepository - find categories by server ID', async () => {
    const mockRepo = createMockCategoryRepository();
    const serverId = new Types.ObjectId().toString();

    const testCategories = [
        createTestCategory({ serverId, name: 'Text' }),
        createTestCategory({ serverId, name: 'Voice' })
    ];

    mockRepo.findByServerId = async (sId) => {
        mockRepo.calls.findByServerId.push(sId);
        return testCategories;
    };

    const result = await mockRepo.findByServerId(serverId);

    assert.equal(result.length, 2);
});

test('CategoryRepository - find max position', async () => {
    const mockRepo = createMockCategoryRepository();
    const serverId = new Types.ObjectId().toString();

    mockRepo.findMaxPosition = async (sId) => {
        mockRepo.calls.findMaxPosition.push(sId);
        return 3;
    };

    const result = await mockRepo.findMaxPosition(serverId);

    assert.equal(result, 3);
});

test('CategoryRepository - update positions (bulk)', async () => {
    const mockRepo = createMockCategoryRepository();
    const updates = [
        { id: new Types.ObjectId().toString(), position: 0 },
        { id: new Types.ObjectId().toString(), position: 1 }
    ];

    const result = await mockRepo.updatePositions(updates);

    assert.equal(mockRepo.calls.updatePositions.length, 1);
    assert.equal(result, true);
});
