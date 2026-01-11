/**
 * WebSocket Isolation Integration Tests
 */

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('assert');
const {
    setup,
    teardown,
    getServer
} = require('./setup.cjs');
const {
    createTestUser,
    generateAuthToken,
    createTestServer,
    createTestChannel,
    createTestMessage
} = require('./helpers.cjs');
const {
    createAuthenticatedClient,
    sendEvent,
    waitForEvent,
    ensureEventNotReceived
} = require('./websocket_helpers.cjs');

describe('WebSocket Isolation Tests', { timeout: 20000 }, function () {
    let appServer;

    // Users
    let userA, userB, userC, userD;
    let tokenA, tokenB, tokenC, tokenD;
    let wsA, wsB, wsC;

    // Server/Channels
    let serverA, channelA;
    let serverB, channelB;

    before(async function () {
        const setupData = await setup();
        appServer = setupData.server;

        // Create Users
        userA = await createTestUser({ username: 'UserA' });
        userB = await createTestUser({ username: 'UserB' });
        userC = await createTestUser({ username: 'UserC' });
        userD = await createTestUser({ username: 'UserD' }); // Owner of Server B

        tokenA = generateAuthToken(userA);
        tokenB = generateAuthToken(userB);
        tokenC = generateAuthToken(userC);
        tokenD = generateAuthToken(userD);

        // Create Server A (Owned by A)
        serverA = await createTestServer(userA._id, { name: 'Server A' });
        channelA = await createTestChannel(serverA._id, { name: 'general-a' });

        // Add User B to Server A
        const { ServerMember } = require('../../src/models/Server');
        await ServerMember.create({
            serverId: serverA._id,
            userId: userB._id,
            roles: []
        });

        // Create Server B (Owned by D)
        serverB = await createTestServer(userD._id, { name: 'Server B' });
        channelB = await createTestChannel(serverB._id, { name: 'general-b' });

        // Add User C to Server B
        await ServerMember.create({
            serverId: serverB._id,
            userId: userC._id,
            roles: []
        });

        // Add Friendship between A and B
        const { Friendship } = require('../../src/models/Friendship');
        await Friendship.create({
            userId: userA._id,
            friendId: userB._id,
            user: userA.username,
            friend: userB.username
        });
    });

    after(async function () {
        const sockets = [wsA, wsB, wsC];
        sockets.forEach(ws => {
            if (ws && ws.readyState === 1) { // WebSocket.OPEN
                ws.close();
            }
        });

        // Give time for disconnection events to process
        await new Promise(resolve => setTimeout(resolve, 500));

        await teardown();
    });

    describe('Direct Messages Isolation', function () {
        // Connect clients before tests
        beforeEach(async function () {
            wsA = await createAuthenticatedClient(appServer, tokenA);
            wsB = await createAuthenticatedClient(appServer, tokenB);
            wsC = await createAuthenticatedClient(appServer, tokenC);
        });

        afterEach(function () {
            if (wsA) wsA.close();
            if (wsB) wsB.close();
            if (wsC) wsC.close();
        });

        it('User A sends DM to User B -> B receives, C does not', async function () {
            const text = `Hello UserB, this is private! ${Date.now()}`;

            // Start listening before sending
            const promiseB = waitForEvent(wsB, 'message_dm', 5000);

            // Send DM from A -> B
            sendEvent(wsA, 'send_message_dm', {
                receiverId: userB._id.toString(),
                text: text
            });

            // Expect B to receive 'message_dm'
            const msgB = await promiseB;
            assert.strictEqual(msgB.text, text);
            assert.strictEqual(msgB.senderId, userA._id.toString());

            // Check C does NOT receive 'message_dm'
            await ensureEventNotReceived(wsC, 'message_dm');
        });

        it('User A edits DM to User B -> B receives update, C does not', async function () {
            // First create a message
            const initialText = `Original message ${Date.now()}`;
            
            // Send
            const promiseInitial = waitForEvent(wsB, 'message_dm', 5000);
            sendEvent(wsA, 'send_message_dm', {
                receiverId: userB._id.toString(),
                text: initialText
            });
            const msgInitial = await promiseInitial;
            const messageId = msgInitial.messageId;

            // Edit
            const newText = `Edited message ${Date.now()}`;
            const promiseEdit = waitForEvent(wsB, 'message_dm_edited', 5000);
            sendEvent(wsA, 'edit_message_dm', {
                messageId: messageId,
                text: newText
            });

            // User B should receive the update
            const editEvent = await promiseEdit;
            assert.strictEqual(editEvent.messageId, messageId);
            assert.strictEqual(editEvent.text, newText);
            assert.strictEqual(editEvent.isEdited, true);
            await ensureEventNotReceived(wsC, 'message_dm_edited');
        });

        it('User A deletes DM to User B -> B receives delete, C does not', async function () {
            // Setup message
            const promiseSetup = waitForEvent(wsB, 'message_dm', 5000);
            sendEvent(wsA, 'send_message_dm', {
                receiverId: userB._id.toString(),
                text: "To be deleted"
            });
            const msgSetup = await promiseSetup;
            const messageId = msgSetup.messageId;

            // Delete
            const promiseDelete = waitForEvent(wsB, 'message_dm_deleted', 5000);
            sendEvent(wsA, 'delete_message_dm', {
                messageId: messageId
            });

            // User B should receive the delete
            const deleteEvent = await promiseDelete;
            assert.strictEqual(deleteEvent.messageId, messageId);

            // C gets nothing
            await ensureEventNotReceived(wsC, 'message_dm_deleted');
        });
    });

    describe('Server Channel Isolation', function () {
        beforeEach(async function () {
            wsA = await createAuthenticatedClient(appServer, tokenA);
            wsB = await createAuthenticatedClient(appServer, tokenB);
            wsC = await createAuthenticatedClient(appServer, tokenC);

            // B joins Channel A (in Server A)
            sendEvent(wsB, 'join_server', { serverId: serverA._id.toString() });
            await waitForEvent(wsB, 'server_joined'); // Wait for ack/event if any, or just wait

            sendEvent(wsB, 'join_channel', {
                serverId: serverA._id.toString(),
                channelId: channelA._id.toString()
            });
            await waitForEvent(wsB, 'channel_joined');

            // C joins Channel B (in Server B)
            sendEvent(wsC, 'join_server', { serverId: serverB._id.toString() });
            await waitForEvent(wsC, 'server_joined'); // Wait for ack

            sendEvent(wsC, 'join_channel', {
                serverId: serverB._id.toString(),
                channelId: channelB._id.toString()
            });
            await waitForEvent(wsC, 'channel_joined');
        });

        afterEach(function () {
            if (wsA) wsA.close();
            if (wsB) wsB.close();
            if (wsC) wsC.close();
        });

        it('User A sends to Channel A -> B (member) receives, C (non-member) does not', async function () {
            const text = `Channel message ${Date.now()}`;

            // A sends to Channel A
            sendEvent(wsA, 'send_message_server', {
                serverId: serverA._id.toString(),
                channelId: channelA._id.toString(),
                text: text
            });

            // B receives
            const msgB = await waitForEvent(wsB, 'message_server');
            assert.strictEqual(msgB.text, text);
            assert.strictEqual(msgB.channelId, channelA._id.toString());

            // C should NOT receive anything (or at least not this message)
            await ensureEventNotReceived(wsC, 'message_server');
        });

        it('User A edits message in Channel A -> B sees update, C does not', async function () {
            // Create message
            sendEvent(wsA, 'send_message_server', {
                serverId: serverA._id.toString(),
                channelId: channelA._id.toString(),
                text: "Original Channel Msg"
            });
            const msgB = await waitForEvent(wsB, 'message_server');
            const messageId = msgB.messageId;

            // Edit
            const newText = "Edited Channel Msg";
            sendEvent(wsA, 'edit_message_server', {
                messageId: messageId,
                text: newText
            });

            // B sees update
            const updateB = await waitForEvent(wsB, 'message_server_edited');
            assert.strictEqual(updateB.messageId, messageId);
            assert.strictEqual(updateB.text, newText);

            // C sees nothing
            await ensureEventNotReceived(wsC, 'message_server_edited');
        });

        it('User A deletes message in Channel A -> B sees delete, C does not', async function () {
            // Create message
            sendEvent(wsA, 'send_message_server', {
                serverId: serverA._id.toString(),
                channelId: channelA._id.toString(),
                text: "Delete Channel Msg"
            });
            const msgB = await waitForEvent(wsB, 'message_server');
            const messageId = msgB.messageId;

            // Delete
            sendEvent(wsA, 'delete_message_server', {
                serverId: serverA._id.toString(), // Protocol requires serverId for checks? Or just messageId?
                messageId: messageId
            });

            // B sees delete
            const deleteB = await waitForEvent(wsB, 'message_server_deleted');
            assert.strictEqual(deleteB.messageId, messageId);

            // C sees nothing
            await ensureEventNotReceived(wsC, 'message_server_deleted');
        });
    });
});
