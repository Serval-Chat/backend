/**
 * Integration Test Helpers
 */

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { io: Client } = require('socket.io-client');

const { User } = require('../../src/models/User');

/**
 * Create a test user in the database
 */
async function createTestUser(overrides = {}) {
    const password = await bcrypt.hash('password123', 10);
    const user = await User.create({
        username: `user_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        login: `test_${Date.now()}@example.com`, // login can act as an email too :p
        password,
        tokenVersion: 0,
        ...overrides
    });
    return user;
}

/**
 * Generate a valid JWT token for a user
 */
function generateAuthToken(user) {
    return jwt.sign(
        {
            id: user._id,
            username: user.username,
            tokenVersion: user.tokenVersion
        },
        process.env.JWT_SECRET || 'test-jwt-secret',
        { expiresIn: '1h' }
    );
}

/**
 * Create a Socket.IO client connection
 */
function createSocketClient(server, token) {
    const address = server.address();
    const url = `http://localhost:${address.port}`;

    return Client(url, {
        auth: { token },
        transports: ['websocket'],
        forceNew: true
    });
}

/**
 * Clear all collections in the database
 */
async function clearDatabase() {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
}

module.exports = {
    createTestUser,
    generateAuthToken,
    createSocketClient,
    clearDatabase,
    User, // Export model for direct access if needed
    createTestServer,
    createTestChannel,
    createTestMessage
};

/**
 * Create a test server
 */
async function createTestServer(ownerId, overrides = {}) {
    const { Server, Role } = require('../../src/models/Server');
    const server = await Server.create({
        name: `Test Server ${Date.now()}`,
        ownerId,
        ...overrides
    });

    // Create @everyone role
    await Role.create({
        serverId: server._id,
        name: '@everyone',
        position: 0,
        permissions: {
            sendMessages: true,
            manageMessages: false,
            deleteMessagesOfOthers: false,
            manageChannels: false,
            manageRoles: false,
            banMembers: false,
            kickMembers: false,
            manageInvites: false,
            manageServer: false,
            administrator: false,
            addReactions: true,
            manageReactions: false
        }
    });

    return server;
}

/**
 * Create a test channel
 */
async function createTestChannel(serverId, overrides = {}) {
    const { Channel } = require('../../src/models/Server');
    const channel = await Channel.create({
        serverId,
        name: 'general',
        type: 'text',
        ...overrides
    });
    return channel;
}

/**
 * Create a test server message
 */
async function createTestMessage(serverId, channelId, senderId, overrides = {}) {
    const { ServerMessage } = require('../../src/models/Server');
    const message = await ServerMessage.create({
        serverId,
        channelId,
        senderId,
        text: 'Test message',
        ...overrides
    });
    return message;
}
