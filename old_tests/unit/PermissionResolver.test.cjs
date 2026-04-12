/**
 * PermissionResolver Unit Tests (pure in-memory)
 */

require('ts-node/register');
require('tsconfig-paths/register');

const test = require('node:test');
const assert = require('node:assert/strict');

const { PermissionResolver } = require('../../src/permissions/PermissionResolver');

test('PermissionResolver - server owner always has all permissions', () => {
    const serverId = 's1';
    const ownerId = 'owner';

    const data = {
        serverId,
        ownerId,
        roles: [
            {
                id: 'r_everyone',
                serverId,
                name: '@everyone',
                position: 0,
                permissions: { sendMessages: true },
            },
        ],
        everyoneRoleId: 'r_everyone',
        channels: [{ id: 'ch1', serverId }],
        categories: [],
        members: [],
    };

    const r = new PermissionResolver(data);

    const perms = [
        'sendMessages',
        'manageMessages',
        'deleteMessagesOfOthers',
        'manageChannels',
        'manageRoles',
        'banMembers',
        'kickMembers',
        'manageInvites',
        'manageServer',
        'administrator',
        'manageWebhooks',
        'pingRolesAndEveryone',
        'addReactions',
        'manageReactions',
    ];

    for (const p of perms) {
        assert.equal(r.hasServerPermission(ownerId, p), true);
        assert.equal(r.canUserDo(ownerId, 'ch1', p), true);
    }
});

test('PermissionResolver - administrator bypasses all checks', () => {
    const serverId = 's1';
    const ownerId = 'owner';

    const data = {
        serverId,
        ownerId,
        roles: [
            {
                id: 'r_everyone',
                serverId,
                name: '@everyone',
                position: 0,
                permissions: {},
            },
            {
                id: 'r_admin',
                serverId,
                name: 'Admin',
                position: 100,
                permissions: { administrator: true },
            },
        ],
        everyoneRoleId: 'r_everyone',
        channels: [{ id: 'ch1', serverId }],
        categories: [],
        members: [
            {
                id: 'm1',
                serverId,
                userId: 'u1',
                roleIds: ['r_admin'],
            },
        ],
    };

    const r = new PermissionResolver(data);

    assert.equal(r.hasServerPermission('u1', 'manageServer'), true);
    assert.equal(r.canUserDo('u1', 'ch1', 'manageMessages'), true);
});

test('PermissionResolver - role hierarchy: higher position overrides lower', () => {
    const serverId = 's1';
    const ownerId = 'owner';

    const data = {
        serverId,
        ownerId,
        roles: [
            {
                id: 'r_everyone',
                serverId,
                name: '@everyone',
                position: 0,
                permissions: { sendMessages: true },
            },
            {
                id: 'r_low',
                serverId,
                name: 'Low',
                position: 1,
                permissions: { manageMessages: false, addReactions: true },
            },
            {
                id: 'r_high',
                serverId,
                name: 'High',
                position: 2,
                permissions: { manageMessages: true },
            },
        ],
        everyoneRoleId: 'r_everyone',
        channels: [{ id: 'ch1', serverId }],
        categories: [],
        members: [
            {
                id: 'm1',
                serverId,
                userId: 'u1',
                roleIds: ['r_low', 'r_high'],
            },
        ],
    };

    const r = new PermissionResolver(data);

    assert.equal(r.hasServerPermission('u1', 'manageMessages'), true);
    assert.equal(r.hasServerPermission('u1', 'addReactions'), true);
    assert.equal(r.hasServerPermission('u1', 'sendMessages'), true);
    assert.equal(r.hasServerPermission('u1', 'manageChannels'), false);
});

test('PermissionResolver - @everyone participates in base merging and overrides', () => {
    const serverId = 's1';
    const ownerId = 'owner';

    const data = {
        serverId,
        ownerId,
        roles: [
            {
                id: 'r_everyone',
                serverId,
                name: '@everyone',
                position: 0,
                permissions: { sendMessages: true },
            },
            {
                id: 'r_member',
                serverId,
                name: 'Member',
                position: 1,
                permissions: {},
            },
        ],
        everyoneRoleId: 'r_everyone',
        categories: [],
        channels: [
            {
                id: 'ch1',
                serverId,
                overrides: new Map([['r_everyone', { sendMessages: false }]]),
            },
        ],
        members: [
            {
                id: 'm1',
                serverId,
                userId: 'u1',
                roleIds: ['r_member'],
            },
        ],
    };

    const r = new PermissionResolver(data);

    // Base server permission should come from @everyone when member roles don't specify.
    assert.equal(r.hasServerPermission('u1', 'sendMessages'), true);

    // Channel override on @everyone should still apply.
    assert.equal(r.canUserDo('u1', 'ch1', 'sendMessages'), false);
});

test("PermissionResolver - deny applies when override targets @everyone roleId", () => {
    const serverId = 's1';
    const ownerId = 'owner';

    const data = {
        serverId,
        ownerId,
        roles: [
            {
                id: 'r_everyone',
                serverId,
                name: '@everyone',
                position: 0,
                permissions: { sendMessages: true },
            },
        ],
        everyoneRoleId: 'r_everyone',
        categories: [],
        channels: [
            {
                id: 'ch1',
                serverId,
                overrides: new Map([['r_everyone', { sendMessages: false }]]),
            },
        ],
        members: [
            {
                id: 'm1',
                serverId,
                userId: 'u1',
                roleIds: [],
            },
        ],
    };

    const r = new PermissionResolver(data);
    assert.equal(r.canUserDo('u1', 'ch1', 'sendMessages'), false);
});

test('PermissionResolver - override hierarchy: channel > category > role', () => {
    const serverId = 's1';
    const ownerId = 'owner';

    const data = {
        serverId,
        ownerId,
        roles: [
            {
                id: 'r_everyone',
                serverId,
                name: '@everyone',
                position: 0,
                permissions: {},
            },
            {
                id: 'r_low',
                serverId,
                name: 'Low',
                position: 1,
                permissions: { manageMessages: true },
            },
            {
                id: 'r_high',
                serverId,
                name: 'High',
                position: 2,
                permissions: { manageMessages: true },
            },
        ],
        everyoneRoleId: 'r_everyone',
        categories: [
            {
                id: 'cat1',
                serverId,
                overrides: new Map([
                    ['r_high', { manageMessages: false }],
                    ['r_low', { manageMessages: true }],
                ]),
            },
        ],
        channels: [
            {
                id: 'ch1',
                serverId,
                categoryId: 'cat1',
                overrides: new Map([
                    ['r_high', { manageMessages: true }],
                    ['r_low', { manageMessages: false }],
                ]),
            },
        ],
        members: [
            {
                id: 'm1',
                serverId,
                userId: 'u1',
                roleIds: ['r_low', 'r_high'],
            },
        ],
    };

    const r = new PermissionResolver(data);

    // Channel override wins: r_high true overrides r_low false
    assert.equal(r.canUserDo('u1', 'ch1', 'manageMessages'), true);

    // Category applies if channel has no overrides
    const r2 = new PermissionResolver({
        ...data,
        channels: [{ id: 'ch2', serverId, categoryId: 'cat1' }],
    });
    // Category overrides: r_high false should win
    assert.equal(r2.canUserDo('u1', 'ch2', 'manageMessages'), false);
});

test('PermissionResolver - non-members and invalid channels return false', () => {
    const serverId = 's1';
    const ownerId = 'owner';

    const data = {
        serverId,
        ownerId,
        roles: [
            {
                id: 'r_everyone',
                serverId,
                name: '@everyone',
                position: 0,
                permissions: { sendMessages: true },
            },
        ],
        everyoneRoleId: 'r_everyone',
        channels: [{ id: 'ch1', serverId }],
        categories: [],
        members: [],
    };

    const r = new PermissionResolver(data);

    assert.equal(r.hasServerPermission('u1', 'sendMessages'), false);
    assert.equal(r.canUserDo('u1', 'ch1', 'sendMessages'), false);
    assert.equal(r.canUserDo('u1', 'missing', 'sendMessages'), false);
});
