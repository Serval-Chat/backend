/**
 * PermissionService Unit Tests
 * 
 * Tests for the permission service including role hierarchy and permission checks.
 */

require('ts-node/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const { PermissionService } = require('../../src/services/PermissionService');
const {
    createMockLogger,
    createMockServerRepository,
    createMockServerMemberRepository,
    createMockRoleRepository,
    createTestServer,
    createTestServerMember,
    createTestRole
} = require('../utils/test-utils.cjs');

test('PermissionService - owner has all permissions', async () => {

    const mockServerRepo = createMockServerRepository();
    const mockMemberRepo = createMockServerMemberRepository();
    const mockRoleRepo = createMockRoleRepository();
    const mockCategoryRepo = { findById: async () => null };
    const mockChannelRepo = { findById: async () => null };

    const ownerId = new Types.ObjectId().toString();
    const serverId = new Types.ObjectId().toString();
    const testServer = createTestServer({ _id: serverId, ownerId });

    mockServerRepo.findById = async () => testServer;

    const permissionService = new PermissionService(
        mockServerRepo,
        mockMemberRepo,
        mockRoleRepo,
        mockCategoryRepo,
        mockChannelRepo
    );

    const result = await permissionService.hasPermission(serverId, ownerId, 'manageServer');

    assert.equal(result, true);
});

test('PermissionService - administrator role has all permissions', async () => {

    const mockServerRepo = createMockServerRepository();
    const mockMemberRepo = createMockServerMemberRepository();
    const mockRoleRepo = createMockRoleRepository();
    const mockCategoryRepo = { findById: async () => null };
    const mockChannelRepo = { findById: async () => null };

    const userId = new Types.ObjectId().toString();
    const serverId = new Types.ObjectId().toString();
    const roleId = new Types.ObjectId();

    const testServer = createTestServer({ _id: serverId });
    const testMember = createTestServerMember({ userId, serverId, roles: [roleId] });
    const adminRole = createTestRole({
        _id: roleId,
        permissions: {
            administrator: true,
            sendMessages: false,
            manageMessages: false,
            deleteMessagesOfOthers: false,
            manageChannels: false,
            manageRoles: false,
            banMembers: false,
            kickMembers: false,
            manageInvites: false,
            manageServer: false
        }
    });

    mockServerRepo.findById = async () => testServer;
    mockMemberRepo.findByServerAndUser = async () => testMember;
    mockRoleRepo.findById = async () => adminRole;

    const permissionService = new PermissionService(
        mockServerRepo,
        mockMemberRepo,
        mockRoleRepo,
        mockCategoryRepo,
        mockChannelRepo
    );

    const result = await permissionService.hasPermission(serverId, userId, 'banMembers');

    assert.equal(result, true);
});

test('PermissionService - check specific permission with role', async () => {

    const mockServerRepo = createMockServerRepository();
    const mockMemberRepo = createMockServerMemberRepository();
    const mockRoleRepo = createMockRoleRepository();
    const mockCategoryRepo = { findById: async () => null };
    const mockChannelRepo = { findById: async () => null };

    const userId = new Types.ObjectId().toString();
    const serverId = new Types.ObjectId().toString();
    const roleId = new Types.ObjectId();

    const testServer = createTestServer({ _id: serverId });
    const testMember = createTestServerMember({ userId, serverId, roles: [roleId] });
    const testRole = createTestRole({
        _id: roleId,
        permissions: {
            administrator: false,
            sendMessages: true,
            manageMessages: true,
            deleteMessagesOfOthers: false,
            manageChannels: false,
            manageRoles: false,
            banMembers: false,
            kickMembers: false,
            manageInvites: false,
            manageServer: false
        }
    });

    mockServerRepo.findById = async () => testServer;
    mockMemberRepo.findByServerAndUser = async () => testMember;
    mockRoleRepo.findById = async () => testRole;

    const permissionService = new PermissionService(
        mockServerRepo,
        mockMemberRepo,
        mockRoleRepo,
        mockCategoryRepo,
        mockChannelRepo
    );

    const hasManageMessages = await permissionService.hasPermission(serverId, userId, 'manageMessages');
    const hasBanMembers = await permissionService.hasPermission(serverId, userId, 'banMembers');

    assert.equal(hasManageMessages, true);
    assert.equal(hasBanMembers, false);
});

test('PermissionService - higher position role overrides lower position', async () => {

    const mockServerRepo = createMockServerRepository();
    const mockMemberRepo = createMockServerMemberRepository();
    const mockRoleRepo = createMockRoleRepository();
    const mockCategoryRepo = { findById: async () => null };
    const mockChannelRepo = { findById: async () => null };

    const userId = new Types.ObjectId().toString();
    const serverId = new Types.ObjectId().toString();
    const role1Id = new Types.ObjectId();
    const role2Id = new Types.ObjectId();

    const testServer = createTestServer({ _id: serverId });
    const testMember = createTestServerMember({ userId, serverId, roles: [role1Id, role2Id] });

    // Lower position role allows permission
    const lowRole = createTestRole({
        _id: role1Id,
        position: 1,
        permissions: {
            administrator: false,
            sendMessages: true,
            manageMessages: true,
            deleteMessagesOfOthers: false,
            manageChannels: false,
            manageRoles: false,
            banMembers: false,
            kickMembers: false,
            manageInvites: false,
            manageServer: false
        }
    });

    // Higher position role denies permission (should win)
    const highRole = createTestRole({
        _id: role2Id,
        position: 10,
        permissions: {
            administrator: false,
            sendMessages: true,
            manageMessages: false, // Explicitly denies
            deleteMessagesOfOthers: false,
            manageChannels: false,
            manageRoles: false,
            banMembers: false,
            kickMembers: false,
            manageInvites: false,
            manageServer: false
        }
    });

    mockServerRepo.findById = async () => testServer;
    mockMemberRepo.findByServerAndUser = async () => testMember;
    mockRoleRepo.findById = async (id) => {
        if (id === role1Id.toString()) return lowRole;
        if (id === role2Id.toString()) return highRole;
        return null;
    };

    const permissionService = new PermissionService(
        mockServerRepo,
        mockMemberRepo,
        mockRoleRepo,
        mockCategoryRepo,
        mockChannelRepo
    );

    const result = await permissionService.hasPermission(serverId, userId, 'manageMessages');

    // Higher position role (10) denies, should return false
    assert.equal(result, false);
});

test('PermissionService - get highest role position for owner', async () => {

    const mockServerRepo = createMockServerRepository();
    const mockMemberRepo = createMockServerMemberRepository();
    const mockRoleRepo = createMockRoleRepository();
    const mockCategoryRepo = { findById: async () => null };
    const mockChannelRepo = { findById: async () => null };

    const ownerId = new Types.ObjectId().toString();
    const serverId = new Types.ObjectId().toString();
    const testServer = createTestServer({ _id: serverId, ownerId });

    mockServerRepo.findById = async () => testServer;

    const permissionService = new PermissionService(
        mockServerRepo,
        mockMemberRepo,
        mockRoleRepo,
        mockCategoryRepo,
        mockChannelRepo
    );

    const position = await permissionService.getHighestRolePosition(serverId, ownerId);

    assert.equal(position, Number.MAX_SAFE_INTEGER);
});

test('PermissionService - get highest role position for member', async () => {

    const mockServerRepo = createMockServerRepository();
    const mockMemberRepo = createMockServerMemberRepository();
    const mockRoleRepo = createMockRoleRepository();
    const mockCategoryRepo = { findById: async () => null };
    const mockChannelRepo = { findById: async () => null };

    const userId = new Types.ObjectId().toString();
    const serverId = new Types.ObjectId().toString();
    const role1Id = new Types.ObjectId();
    const role2Id = new Types.ObjectId();

    const testServer = createTestServer({ _id: serverId });
    const testMember = createTestServerMember({ userId, serverId, roles: [role1Id, role2Id] });

    const role1 = createTestRole({ _id: role1Id, position: 5 });
    const role2 = createTestRole({ _id: role2Id, position: 10 });

    mockServerRepo.findById = async () => testServer;
    mockMemberRepo.findByServerAndUser = async () => testMember;
    mockRoleRepo.findById = async (id) => {
        if (id === role1Id.toString()) return role1;
        if (id === role2Id.toString()) return role2;
        return null;
    };

    const permissionService = new PermissionService(
        mockServerRepo,
        mockMemberRepo,
        mockRoleRepo,
        mockCategoryRepo,
        mockChannelRepo
    );

    const position = await permissionService.getHighestRolePosition(serverId, userId);

    assert.equal(position, 10); // Highest role position
});

test('PermissionService - non-member has no permissions', async () => {

    const mockServerRepo = createMockServerRepository();
    const mockMemberRepo = createMockServerMemberRepository();
    const mockRoleRepo = createMockRoleRepository();
    const mockCategoryRepo = { findById: async () => null };
    const mockChannelRepo = { findById: async () => null };

    const userId = new Types.ObjectId().toString();
    const serverId = new Types.ObjectId().toString();
    const testServer = createTestServer({ _id: serverId });

    mockServerRepo.findById = async () => testServer;
    mockMemberRepo.findByServerAndUser = async () => null; // Not a member

    const permissionService = new PermissionService(
        mockServerRepo,
        mockMemberRepo,
        mockRoleRepo,
        mockCategoryRepo,
        mockChannelRepo
    );

    const result = await permissionService.hasPermission(serverId, userId, 'sendMessages');

    assert.equal(result, false);
});
