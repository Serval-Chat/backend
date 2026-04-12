/**
 * PermissionService SendMessages Security Unit Tests - Everyone Role
 * 
 * Tests for restricted permission bypass specifically for @everyone role.
 */

require('ts-node/register');
require('tsconfig-paths/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const { PermissionService } = require('../../src/services/PermissionService');
const {
    createMockServerRepository,
    createMockServerMemberRepository,
    createMockRoleRepository,
    createMockChannelRepository,
    createTestServer,
    createTestServerMember,
    createTestRole,
    createTestChannel
} = require('../utils/test-utils.cjs');

test('Security - enforce sendMessages permission with @everyone channel overrides', async () => {
    const mockServerRepo = createMockServerRepository();
    const mockMemberRepo = createMockServerMemberRepository();
    const mockRoleRepo = createMockRoleRepository();
    const mockCategoryRepo = { findById: async () => null };
    const mockChannelRepo = createMockChannelRepository();

    const userId = new Types.ObjectId().toString();
    const serverId = new Types.ObjectId().toString();
    const channelId = new Types.ObjectId().toString();
    const everyoneRoleId = new Types.ObjectId();

    // 1. Server and Channel
    const testServer = createTestServer({ _id: serverId });
    const testChannel = createTestChannel({
        _id: channelId,
        serverId: serverId,
        permissions: {
            [everyoneRoleId.toString()]: {
                sendMessages: false // @everyone DENIED in channel
            }
        }
    });

    // 2. Member with ONLY @everyone role (implicit or explicit)
    // Base @everyone role has it ALLOWED
    const everyoneRole = createTestRole({
        _id: everyoneRoleId,
        serverId: serverId,
        name: '@everyone',
        permissions: {
            sendMessages: true // BASE ALLOW
        }
    });

    const testMember = createTestServerMember({
        userId,
        serverId,
        roles: [] // Only @everyone role
    });

    mockServerRepo.findById = async () => testServer;
    mockChannelRepo.findById = async () => testChannel;
    mockMemberRepo.findByServerAndUser = async () => testMember;
    mockRoleRepo.findEveryoneRole = async () => everyoneRole;
    mockRoleRepo.findById = async (id) => {
        if (id === everyoneRoleId.toString()) return everyoneRole;
        return null;
    }

    const permissionService = new PermissionService(
        mockServerRepo,
        mockMemberRepo,
        mockRoleRepo,
        mockCategoryRepo,
        mockChannelRepo
    );

    // 3. Check permission
    const result = await permissionService.hasChannelPermission(
        serverId,
        userId,
        channelId,
        'sendMessages'
    );

    // EXPECTATION: Channel override for @everyone (false) should override Role permission (true)
    assert.equal(result, false, 'Security Vulnerability: User bypassed @everyone channel sendMessages override!');
});
