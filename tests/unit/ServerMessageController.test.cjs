require('ts-node/register');
require('tsconfig-paths/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');

const { ServerMessageController } = require('../../src/controllers/ServerMessageController');

test('ServerMessageController - getMessages throws ForbiddenException when trying to read from a link channel', async () => {
    const serverId = new Types.ObjectId('507f1f77bcf86cd799439011');
    const mockServerMessageRepo = {};
    const mockServerMemberRepo = {
        findByServerAndUser: async () => ({ _id: new Types.ObjectId(), serverId, userId: new Types.ObjectId() })
    };
    const mockChannelRepo = {
        findById: async (channelId) => ({ _id: channelId, serverId, type: 'link' })
    };
    const mockReactionRepo = {};
    const mockPermissionService = {};
    const mockLogger = {};
    const mockWsServer = {};

    const controller = new ServerMessageController(
        mockServerMessageRepo,
        mockServerMemberRepo,
        mockChannelRepo,
        mockReactionRepo,
        mockPermissionService,
        mockLogger,
        mockWsServer
    );

    const mockReq = {
        user: { id: new Types.ObjectId().toString(), username: 'testuser' }
    };

    try {
        await controller.getMessages(serverId.toString(), new Types.ObjectId().toString(), mockReq);
        assert.fail('Should have thrown ForbiddenException');
    } catch (err) {
        assert.equal(err.message, 'Cannot read messages from a link channel');
        assert.equal(err.status, 403);
    }
});

test('ServerMessageController - getMessage throws ForbiddenException when trying to read a single message from a link channel', async () => {
    const serverId = new Types.ObjectId('507f1f77bcf86cd799439011');
    const mockServerMessageRepo = {};
    const mockServerMemberRepo = {
        findByServerAndUser: async () => ({ _id: new Types.ObjectId(), serverId, userId: new Types.ObjectId() })
    };
    const mockChannelRepo = {
        findById: async (channelId) => ({ _id: channelId, serverId, type: 'link' })
    };
    const mockReactionRepo = {};
    const mockPermissionService = {};
    const mockLogger = {};
    const mockWsServer = {};

    const controller = new ServerMessageController(
        mockServerMessageRepo,
        mockServerMemberRepo,
        mockChannelRepo,
        mockReactionRepo,
        mockPermissionService,
        mockLogger,
        mockWsServer
    );

    const mockReq = {
        user: { id: new Types.ObjectId().toString(), username: 'testuser' }
    };

    try {
        await controller.getMessage(serverId.toString(), new Types.ObjectId().toString(), new Types.ObjectId().toString(), mockReq);
        assert.fail('Should have thrown ForbiddenException');
    } catch (err) {
        assert.equal(err.message, 'Cannot read a message from a link channel');
        assert.equal(err.status, 403);
    }
});
