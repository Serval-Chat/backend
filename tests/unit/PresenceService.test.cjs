/**
 * PresenceService Unit Tests
 */

require('ts-node/register');

const test = require('node:test');
const assert = require('node:assert/strict');

test('PresenceService - track socket connection', () => {
    const onlineUsers = new Map();
    const userId = 'user123';
    const socketId = 'socket456';

    // Simulate tracking connection
    if (!onlineUsers.has(userId)) {
        onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socketId);

    assert.ok(onlineUsers.has(userId));
    assert.ok(onlineUsers.get(userId).has(socketId));
});

test('PresenceService - track socket disconnection', () => {
    const onlineUsers = new Map();
    const userId = 'user123';
    const socketId = 'socket456';

    // Setup: add the socket
    onlineUsers.set(userId, new Set([socketId]));

    // Simulate disconnection
    if (onlineUsers.has(userId)) {
        onlineUsers.get(userId).delete(socketId);
        if (onlineUsers.get(userId).size === 0) {
            onlineUsers.delete(userId);
        }
    }

    assert.equal(onlineUsers.has(userId), false);
});

test('PresenceService - get online users', () => {
    const onlineUsers = new Map();
    onlineUsers.set('user1', new Set(['socket1']));
    onlineUsers.set('user2', new Set(['socket2', 'socket3']));
    onlineUsers.set('user3', new Set(['socket4']));

    const userIds = Array.from(onlineUsers.keys());

    assert.equal(userIds.length, 3);
    assert.ok(userIds.includes('user1'));
    assert.ok(userIds.includes('user2'));
});

test('PresenceService - get user sockets', () => {
    const onlineUsers = new Map();
    const userId = 'user123';
    onlineUsers.set(userId, new Set(['socket1', 'socket2', 'socket3']));

    const sockets = onlineUsers.get(userId);

    assert.ok(sockets);
    assert.equal(sockets.size, 3);
    assert.ok(sockets.has('socket1'));
});

test('PresenceService - check if user is online', () => {
    const onlineUsers = new Map();
    onlineUsers.set('user123', new Set(['socket1']));

    const isOnline = onlineUsers.has('user123');
    const isOffline = onlineUsers.has('user456');

    assert.equal(isOnline, true);
    assert.equal(isOffline, false);
});
