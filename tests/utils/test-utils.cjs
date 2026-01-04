/**
 * Test Utilities
 * 
 * Shared utilities, mocks, and factories for unit tests
 */

const { Types } = require('mongoose');

/**
 * Create a mock logger that implements ILogger
 */
function createMockLogger() {
    return {
        info: () => { },
        error: () => { },
        warn: () => { },
        debug: () => { }
    };
}

/**
 * Create a mock user repository with trackable calls
 */
function createMockUserRepository() {
    const calls = {
        findById: [],
        findByLogin: [],
        findByUsername: [],
        comparePassword: [],
        create: [],
        update: [],
        incrementTokenVersion: [],
        updateBanner: [],
        updateProfilePicture: []
    };

    return {
        calls,
        findById: async (id) => {
            calls.findById.push(id);
            return null;
        },
        findByLogin: async (login) => {
            calls.findByLogin.push(login);
            return null;
        },
        findByUsername: async (username) => {
            calls.findByUsername.push(username);
            return null;
        },
        comparePassword: async (id, password) => {
            calls.comparePassword.push({ id, password });
            return false;
        },
        create: async (data) => {
            calls.create.push(data);
            return null;
        },
        update: async (id, data) => {
            calls.update.push({ id, data });
            return null;
        },
        incrementTokenVersion: async (id) => {
            calls.incrementTokenVersion.push(id);
        },
        updateBanner: async (id, filename) => {
            calls.updateBanner.push({ id, filename });
        },
        updateProfilePicture: async (id, filename) => {
            calls.updateProfilePicture.push({ id, filename });
        }
    };
}

/**
 * Create a mock ban repository with trackable calls
 */
function createMockBanRepository() {
    const calls = {
        checkExpired: [],
        findActiveByUserId: [],
        create: [],
        expire: []
    };

    return {
        calls,
        checkExpired: async (userId) => {
            calls.checkExpired.push(userId);
        },
        findActiveByUserId: async (userId) => {
            calls.findActiveByUserId.push(userId);
            return null;
        },
        create: async (userId, reason, expirationTimestamp) => {
            calls.create.push({ userId, reason, expirationTimestamp });
            return null;
        },
        expire: async (banId) => {
            calls.expire.push(banId);
            return true;
        }
    };
}

/**
 * Create a mock Express request object
 */
function createMockRequest(overrides = {}) {
    return {
        headers: {},
        body: {},
        query: {},
        params: {},
        path: '/api/v1/test',
        ...overrides
    };
}

/**
 * Create a mock response object for middleware testing
 */
function createMockResponse() {
    const res = {
        statusCode: 200,
        jsonData: null,
        status: function (code) {
            res.statusCode = code;
            res.status.called = true;
            return res;
        },
        json: function (data) {
            res.jsonData = data;
            res.body = data;
            return res;
        },
        send: function (data) {
            res.jsonData = data;
            res.body = data;
            return res;
        },
        end: function (...args) {
            res.end.called = true;
            return res;
        },
        get: function (headerName) {
            return res.headers && res.headers[headerName];
        },
        headers: {},
        cookie: function (name, value, options) {
            return res;
        },
        redirect: function (url) {
            res.redirectUrl = url;
            res.end.called = true;
            return res;
        }
    };
    res.status.called = false;
    res.end.called = false;
    return res;
}

/**
 * Create a mock next function for middleware
 */
function createMockNext() {
    const next = () => {
        next.called = true;
    };
    next.called = false;
    return next;
}

/**
 * Create a test user object
 */
function createTestUser(overrides = {}) {
    return {
        _id: new Types.ObjectId(),
        username: 'testuser',
        login: 'testuser',
        password: '$2b$10$hashedpassword',
        email: 'test@example.com',
        tokenVersion: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides
    };
}

/**
 * Create a test ban object
 */
function createTestBan(overrides = {}) {
    return {
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(),
        reason: 'Test ban reason',
        active: true,
        createdAt: new Date(),
        ...overrides
    };
}

/**
 * Create a mock message repository with trackable calls
 */
function createMockMessageRepository() {
    const calls = {
        findById: [],
        findByConversation: [],
        create: [],
        update: [],
        delete: []
    };

    return {
        calls,
        findById: async (id) => {
            calls.findById.push(id);
            return null;
        },
        findByConversation: async (user1Id, user2Id, limit, before) => {
            calls.findByConversation.push({ user1Id, user2Id, limit, before });
            return [];
        },
        create: async (data) => {
            calls.create.push(data);
            return createTestMessage(data);
        },
        update: async (id, text) => {
            calls.update.push({ id, text });
            return null;
        },
        delete: async (id) => {
            calls.delete.push(id);
            return true;
        }
    };
}

/**
 * Create a mock DM unread repository with trackable calls
 */
function createMockDmUnreadRepository() {
    const calls = {
        findByUser: [],
        findByUserAndPeer: [],
        increment: [],
        reset: []
    };

    return {
        calls,
        findByUser: async (userId) => {
            calls.findByUser.push(userId);
            return [];
        },
        findByUserAndPeer: async (userId, peerId) => {
            calls.findByUserAndPeer.push({ userId, peerId });
            return null;
        },
        increment: async (userId, peerId) => {
            calls.increment.push({ userId, peerId });
        },
        reset: async (userId, peerId) => {
            calls.reset.push({ userId, peerId });
        }
    };
}

/**
 * Create a mock friendship repository with trackable calls
 */
function createMockFriendshipRepository() {
    const calls = {
        areFriends: [],
        findByUserId: [],
        create: [],
        remove: [],
        createRequest: [],
        acceptRequest: [],
        rejectRequest: [],
        findRequestById: [],
        findRequestBetweenUsers: [],
        findExistingRequest: [],
        findPendingRequestsFor: []
    };

    return {
        calls,
        areFriends: async (user1Id, user2Id) => {
            calls.areFriends.push({ user1Id, user2Id });
            return true; // Default to friends
        },
        findByUserId: async (userId) => {
            calls.findByUserId.push(userId);
            return [];
        },
        create: async (userId, friendId) => {
            calls.create.push({ userId, friendId });
            return createTestFriendship({ userId, friendId });
        },
        remove: async (userId, friendId) => {
            calls.remove.push({ userId, friendId });
            return true;
        },
        createRequest: async (fromId, toId) => {
            calls.createRequest.push({ fromId, toId });
            return createTestFriendRequest({ fromId, toId, status: 'pending' });
        },
        acceptRequest: async (requestId) => {
            calls.acceptRequest.push(requestId);
            return createTestFriendRequest({ _id: requestId, status: 'accepted' });
        },
        rejectRequest: async (requestId) => {
            calls.rejectRequest.push(requestId);
            return true;
        },
        findRequestById: async (requestId) => {
            calls.findRequestById.push(requestId);
            return null;
        },
        findRequestBetweenUsers: async (fromId, toId) => {
            calls.findRequestBetweenUsers.push({ fromId, toId });
            return null;
        },
        findExistingRequest: async (fromId, toId) => {
            calls.findExistingRequest.push({ fromId, toId });
            return null;
        },
        findPendingRequestsFor: async (userId) => {
            calls.findPendingRequestsFor.push(userId);
            return [];
        }
    };
}

/**
 * Create a test message object
 */
function createTestMessage(overrides = {}) {
    return {
        _id: new Types.ObjectId(),
        senderId: new Types.ObjectId(),
        receiverId: new Types.ObjectId(),
        text: 'Test message',
        createdAt: new Date(),
        isEdited: false,
        ...overrides
    };
}

/**
 * Create a test DM unread object
 */
function createTestDmUnread(overrides = {}) {
    return {
        _id: new Types.ObjectId(),
        user: new Types.ObjectId(),
        peer: new Types.ObjectId(),
        count: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides
    };
}

/**
 * Create a test friendship object
 */
function createTestFriendship(overrides = {}) {
    return {
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(),
        friendId: new Types.ObjectId(),
        createdAt: new Date(),
        ...overrides
    };
}

/**
 * Create a test friend request object
 */
function createTestFriendRequest(overrides = {}) {
    return {
        _id: new Types.ObjectId(),
        fromId: new Types.ObjectId(),
        toId: new Types.ObjectId(),
        status: 'pending',
        createdAt: new Date(),
        ...overrides
    };
}

/**
 * Create a mock server repository with trackable calls
 */
function createMockServerRepository() {
    const calls = {
        findById: [],
        findByIds: [],
        findByOwnerId: [],
        create: [],
        update: [],
        delete: [],
        clearDefaultRole: []
    };

    return {
        calls,
        findById: async (id) => {
            calls.findById.push(id);
            return null;
        },
        findByIds: async (ids) => {
            calls.findByIds.push(ids);
            return [];
        },
        findByOwnerId: async (ownerId) => {
            calls.findByOwnerId.push(ownerId);
            return [];
        },
        create: async (data) => {
            calls.create.push(data);
            return createTestServer(data);
        },
        update: async (id, data) => {
            calls.update.push({ id, data });
            return null;
        },
        delete: async (id) => {
            calls.delete.push(id);
            return true;
        },
        clearDefaultRole: async (serverId, roleId) => {
            calls.clearDefaultRole.push({ serverId, roleId });
            return true;
        }
    };
}

/**
 * Create a mock role repository with trackable calls
 */
function createMockRoleRepository() {
    const calls = {
        findById: [],
        findByServerId: [],
        create: [],
        update: [],
        delete: []
    };

    return {
        calls,
        findById: async (id) => {
            calls.findById.push(id);
            return null;
        },
        findByServerId: async (serverId) => {
            calls.findByServerId.push(serverId);
            return [];
        },
        create: async (data) => {
            calls.create.push(data);
            return createTestRole(data);
        },
        update: async (id, data) => {
            calls.update.push({ id, data });
            return null;
        },
        delete: async (id) => {
            calls.delete.push(id);
            return true;
        }
    };
}

/**
 * Create a mock server member repository with trackable calls
 */
function createMockServerMemberRepository() {
    const calls = {
        findByServerAndUser: [],
        findByServer: [],
        create: [],
        delete: [],
        findServerIdsByUserId: []
    };

    return {
        calls,
        findByServerAndUser: async (serverId, userId) => {
            calls.findByServerAndUser.push({ serverId, userId });
            return null;
        },
        findByServer: async (serverId) => {
            calls.findByServer.push(serverId);
            return [];
        },
        create: async (data) => {
            calls.create.push(data);
            return createTestServerMember(data);
        },
        delete: async (serverId, userId) => {
            calls.delete.push({ serverId, userId });
            return true;
        },
        findServerIdsByUserId: async (userId) => {
            calls.findServerIdsByUserId.push(userId);
            return [];
        }
    };
}

/**
 * Create a test server object
 */
function createTestServer(overrides = {}) {
    return {
        _id: new Types.ObjectId(),
        name: 'Test Server',
        ownerId: new Types.ObjectId(),
        createdAt: new Date(),
        ...overrides
    };
}

/**
 * Create a test role object
 */
function createTestRole(overrides = {}) {
    return {
        _id: new Types.ObjectId(),
        serverId: new Types.ObjectId(),
        name: 'Test Role',
        color: '#99aab5',
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
            administrator: false
        },
        createdAt: new Date(),
        ...overrides
    };
}

/**
 * Create a test server member object
*/
function createTestServerMember(overrides = {}) {
    return {
        _id: new Types.ObjectId(),
        serverId: new Types.ObjectId(),
        userId: new Types.ObjectId(),
        roles: [],
        joinedAt: new Date(),
        ...overrides
    };
}

/**
 * Create a test channel object
 */
function createTestChannel(overrides = {}) {
    return {
        _id: new Types.ObjectId(),
        serverId: new Types.ObjectId(),
        name: 'general',
        type: 'text',
        position: 0,
        createdAt: new Date(),
        ...overrides
    };
}

/**
 * Create a test category object
 */
function createTestCategory(overrides = {}) {
    return {
        _id: new Types.ObjectId(),
        serverId: new Types.ObjectId(),
        name: 'General',
        position: 0,
        createdAt: new Date(),
        ...overrides
    };
}

/**
 * Create a mock channel repository with trackable calls
 */
function createMockChannelRepository() {
    const calls = {
        findById: [],
        findByServerId: [],
        create: [],
        update: [],
        delete: [],
        deleteByServerId: [],
        findMaxPosition: []
    };

    return {
        calls,
        findById: async (id) => {
            calls.findById.push(id);
            return null;
        },
        findByServerId: async (serverId) => {
            calls.findByServerId.push(serverId);
            return [];
        },
        create: async (data) => {
            calls.create.push(data);
            return createTestChannel(data);
        },
        update: async (id, data) => {
            calls.update.push({ id, data });
            return null;
        },
        delete: async (id) => {
            calls.delete.push(id);
            return true;
        },
        deleteByServerId: async (serverId) => {
            calls.deleteByServerId.push(serverId);
            return { deletedCount: 0 };
        },
        findMaxPosition: async (serverId) => {
            calls.findMaxPosition.push(serverId);
            return 0;
        }
    };
}

/**
 * Create a mock category repository with trackable calls
 */
function createMockCategoryRepository() {
    const calls = {
        findById: [],
        findByServerId: [],
        create: [],
        update: [],
        delete: [],
        findMaxPosition: [],
        updatePositions: []
    };

    return {
        calls,
        findById: async (id) => {
            calls.findById.push(id);
            return null;
        },
        findByServerId: async (serverId) => {
            calls.findByServerId.push(serverId);
            return [];
        },
        create: async (data) => {
            calls.create.push(data);
            return createTestCategory(data);
        },
        update: async (id, data) => {
            calls.update.push({ id, data });
            return null;
        },
        delete: async (id) => {
            calls.delete.push(id);
            return true;
        },
        findMaxPosition: async (serverId) => {
            calls.findMaxPosition.push(serverId);
            return 0;
        },
        updatePositions: async (updates) => {
            calls.updatePositions.push(updates);
            return true;
        }
    };
}

/**
 * Create a mock invite repository with trackable calls
 */
function createMockInviteRepository() {
    const calls = {
        findByCode: [],
        findByServerId: [],
        create: [],
        delete: [],
        deleteByServerId: [],
        incrementUses: [],
        isExpired: [],
        isUsesExceeded: []
    };

    return {
        calls,
        findByCode: async (code) => {
            calls.findByCode.push(code);
            return null;
        },
        findByServerId: async (serverId) => {
            calls.findByServerId.push(serverId);
            return [];
        },
        create: async (data) => {
            calls.create.push(data);
            return createTestInvite(data);
        },
        delete: async (id) => {
            calls.delete.push(id);
            return true;
        },
        deleteByServerId: async (serverId) => {
            calls.deleteByServerId.push(serverId);
            return { deletedCount: 0 };
        },
        incrementUses: async (id) => {
            calls.incrementUses.push(id);
            return true;
        },
        isExpired: (invite) => {
            calls.isExpired.push(invite);
            return !!(invite.expiresAt && invite.expiresAt < new Date());
        },
        isUsesExceeded: (invite) => {
            calls.isUsesExceeded.push(invite);
            return !!(invite.maxUses && invite.uses >= invite.maxUses);
        }
    };
}

/**
 * Create a test invite object
 */
function createTestInvite(overrides = {}) {
    return {
        _id: new Types.ObjectId(),
        serverId: new Types.ObjectId(),
        code: 'testinvite123',
        createdByUserId: new Types.ObjectId(),
        uses: 0,
        createdAt: new Date(),
        ...overrides
    };
}

/**
 * Create a mock server message repository
 */
function createMockServerMessageRepository() {
    const calls = {
        findById: [],
        findByChannel: [],
        create: [],
        update: [],
        delete: [],
        deleteByChannelId: [],
        deleteByServerId: []
    };

    return {
        calls,
        findById: async (id) => {
            calls.findById.push(id);
            return null;
        },
        findByChannel: async (channelId, limit, before) => {
            calls.findByChannel.push({ channelId, limit, before });
            return [];
        },
        create: async (data) => {
            calls.create.push(data);
            return createTestServerMessage(data);
        },
        update: async (id, text) => {
            calls.update.push({ id, text });
            return null;
        },
        delete: async (id) => {
            calls.delete.push(id);
            return true;
        },
        deleteByChannelId: async (channelId) => {
            calls.deleteByChannelId.push(channelId);
            return { deletedCount: 0 };
        },
        deleteByServerId: async (serverId) => {
            calls.deleteByServerId.push(serverId);
            return { deletedCount: 0 };
        }
    };
}

/**
 * Create a mock webhook repository
 */
function createMockWebhookRepository() {
    const calls = {
        findByToken: [],
        findByChannel: [],
        findByServer: [],
        create: [],
        delete: []
    };

    return {
        calls,
        findByToken: async (token) => {
            calls.findByToken.push(token);
            return null;
        },
        findByChannel: async (channelId) => {
            calls.findByChannel.push(channelId);
            return [];
        },
        findByServer: async (serverId) => {
            calls.findByServer.push(serverId);
            return [];
        },
        create: async (data) => {
            calls.create.push(data);
            return createTestWebhook(data);
        },
        delete: async (id) => {
            calls.delete.push(id);
            return true;
        }
    };
}

/**
 * Create a mock emoji repository
 */
function createMockEmojiRepository() {
    const calls = {
        findGlobal: [],
        findByServerId: [],
        findByName: [],
        create: [],
        delete: []
    };

    return {
        calls,
        findGlobal: async () => {
            calls.findGlobal.push(true);
            return [];
        },
        findByServerId: async (serverId) => {
            calls.findByServerId.push(serverId);
            return [];
        },
        findByName: async (name, serverId) => {
            calls.findByName.push({ name, serverId });
            return null;
        },
        create: async (data) => {
            calls.create.push(data);
            return createTestEmoji(data);
        },
        delete: async (id) => {
            calls.delete.push(id);
            return true;
        }
    };
}

/**
 * Create a test server message object
 */
function createTestServerMessage(overrides = {}) {
    return {
        _id: new Types.ObjectId(),
        serverId: new Types.ObjectId(),
        channelId: new Types.ObjectId(),
        senderId: new Types.ObjectId(),
        text: 'Test server message',
        createdAt: new Date(),
        ...overrides
    };
}

/**
 * Create a test webhook object
 */
function createTestWebhook(overrides = {}) {
    return {
        _id: new Types.ObjectId(),
        serverId: new Types.ObjectId(),
        channelId: new Types.ObjectId(),
        name: 'Test Webhook',
        token: 'webhook_token_' + Math.random().toString(36).substring(7),
        createdByUserId: new Types.ObjectId(),
        createdAt: new Date(),
        ...overrides
    };
}

/**
 * Create a test emoji object
 */
function createTestEmoji(overrides = {}) {
    return {
        _id: new Types.ObjectId(),
        name: 'test_emoji',
        url: 'https://example.com/emoji.png',
        global: false,
        serverId: new Types.ObjectId(),
        createdAt: new Date(),
        ...overrides
    };
}

module.exports = {
    createMockLogger,
    createMockUserRepository,
    createMockBanRepository,
    createMockMessageRepository,
    createMockDmUnreadRepository,
    createMockFriendshipRepository,
    createMockServerRepository,
    createMockRoleRepository,
    createMockServerMemberRepository,
    createMockChannelRepository,
    createMockCategoryRepository,
    createMockInviteRepository,
    createMockServerMessageRepository,
    createMockWebhookRepository,
    createMockEmojiRepository,
    createMockRequest,
    createMockResponse,
    createMockNext,
    createTestUser,
    createTestBan,
    createTestMessage,
    createTestDmUnread,
    createTestFriendship,
    createTestFriendRequest,
    createTestServer,
    createTestRole,
    createTestServerMember,
    createTestChannel,
    createTestCategory,
    createTestInvite,
    createTestServerMessage,
    createTestWebhook,
    createTestEmoji
};
