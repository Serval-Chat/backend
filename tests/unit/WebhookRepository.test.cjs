/**
 * WebhookRepository Unit Tests
 */

require('ts-node/register');
require('tsconfig-paths/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const {
    createMockWebhookRepository,
    createTestWebhook
} = require('../utils/test-utils.cjs');

test('WebhookRepository - create webhook', async () => {
    const mockRepo = createMockWebhookRepository();
    const webhookData = {
        serverId: new Types.ObjectId().toString(),
        channelId: new Types.ObjectId().toString(),
        name: 'GitHub Webhook',
        createdByUserId: new Types.ObjectId().toString()
    };

    const result = await mockRepo.create(webhookData);

    assert.equal(mockRepo.calls.create.length, 1);
    assert.ok(result._id);
    assert.ok(result.token);
    assert.equal(result.name, 'GitHub Webhook');
});

test('WebhookRepository - delete webhook', async () => {
    const mockRepo = createMockWebhookRepository();
    const webhookId = new Types.ObjectId().toString();

    const result = await mockRepo.delete(webhookId);

    assert.equal(mockRepo.calls.delete.length, 1);
    assert.equal(result, true);
});

test('WebhookRepository - find webhook by token', async () => {
    const mockRepo = createMockWebhookRepository();
    const token = 'webhook_abc123';
    const testWebhook = createTestWebhook({ token });

    mockRepo.findByToken = async (t) => {
        mockRepo.calls.findByToken.push(t);
        return t === token ? testWebhook : null;
    };

    const result = await mockRepo.findByToken(token);

    assert.ok(result);
    assert.equal(result.token, token);
});

test('WebhookRepository - find webhooks by channel', async () => {
    const mockRepo = createMockWebhookRepository();
    const channelId = new Types.ObjectId().toString();

    const testWebhooks = [
        createTestWebhook({ channelId }),
        createTestWebhook({ channelId })
    ];

    mockRepo.findByChannel = async (chId) => {
        mockRepo.calls.findByChannel.push(chId);
        return testWebhooks;
    };

    const result = await mockRepo.findByChannel(channelId);

    assert.equal(result.length, 2);
});

test('WebhookRepository - find webhooks by server', async () => {
    const mockRepo = createMockWebhookRepository();
    const serverId = new Types.ObjectId().toString();

    const testWebhooks = [
        createTestWebhook({ serverId }),
        createTestWebhook({ serverId })
    ];

    mockRepo.findByServer = async (sId) => {
        mockRepo.calls.findByServer.push(sId);
        return testWebhooks;
    };

    const result = await mockRepo.findByServer(serverId);

    assert.equal(result.length, 2);
});
