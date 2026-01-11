/**
 * WebSocket Cleanup & Health Integration Tests
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
    setup,
    teardown
} = require('./setup.cjs');
const {
    createTestUser,
    generateAuthToken,
    clearDatabase
} = require('./helpers.cjs');
const {
    createAuthenticatedClient,
    sendEvent,
    waitForEvent
} = require('./websocket_helpers.cjs');

describe('WebSocket Cleanup Tests', { timeout: 30000 }, function () {
    let appServer;
    let wsServer;
    let container;
    let TYPES;

    before(async function () {
        const setupData = await setup();
        appServer = setupData.server;

        const di = require('../../src/di/container');
        const types = require('../../src/di/types');
        container = di.container;
        TYPES = types.TYPES;
        wsServer = container.get(TYPES.WsServer);
    });

    after(async function () {
        await teardown();
    });

    beforeEach(async function () {
        await clearDatabase();
    });

    it('should clean up resources after user disconnects', async function () {
        const user = await createTestUser();
        const token = generateAuthToken(user);

        // State before: should be clean
        const metricsBefore = wsServer.getMetrics();
        assert.strictEqual(metricsBefore.totalConnections, 0);

        // Connect
        const ws = await createAuthenticatedClient(appServer, token);

        // Wait for presence sync so sync task is done
        await waitForEvent(ws, 'presence_sync');

        const metricsConnected = wsServer.getMetrics();
        assert.strictEqual(metricsConnected.totalConnections, 1);
        assert.strictEqual(metricsConnected.authenticatedUsers, 1);

        // Disconnect
        ws.close();

        // Wait a bit for server to process close
        await new Promise(r => setTimeout(r, 1000));

        const metricsAfter = wsServer.getMetrics();
        assert.strictEqual(metricsAfter.totalConnections, 0);
        assert.strictEqual(metricsAfter.authenticatedUsers, 0);
    });

    it('should clean up channel subscriptions on disconnect', async function () {
        const user = await createTestUser();
        const token = generateAuthToken(user);

        const { createTestServer, createTestChannel } = require('./helpers.cjs');
        const server = await createTestServer(user._id);
        const channel = await createTestChannel(server._id);

        const ws = await createAuthenticatedClient(appServer, token);

        // Join server and channel
        sendEvent(ws, 'join_server', { serverId: server._id.toString() });
        await waitForEvent(ws, 'server_joined');

        sendEvent(ws, 'join_channel', {
            serverId: server._id.toString(),
            channelId: channel._id.toString()
        });
        await waitForEvent(ws, 'channel_joined');

        const metricsJoined = wsServer.getMetrics();
        assert.strictEqual(metricsJoined.channelSubscriptions, 1);
        assert.strictEqual(metricsJoined.serverSubscriptions, 1);

        // Disconnect
        ws.close();

        // Wait for cleanup
        await new Promise(r => setTimeout(r, 1000));

        const metricsAfter = wsServer.getMetrics();
        assert.strictEqual(metricsAfter.channelSubscriptions, 0);
        assert.strictEqual(metricsAfter.serverSubscriptions, 0);
    });
});
