import { Types } from 'mongoose';
import { PermissionResolver } from '../src/permissions/PermissionResolver';
import type { ServerData } from '../src/permissions/types';

describe('PermissionResolver - seeDeletedMessages', () => {
    const ownerId = new Types.ObjectId().toString();
    const modId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();
    const serverId = new Types.ObjectId().toString();
    const everyoneRoleId = new Types.ObjectId().toString();
    const modRoleId = new Types.ObjectId().toString();
    const channelId = new Types.ObjectId().toString();

    const mockData: ServerData = {
        serverId,
        ownerId,
        everyoneRoleId,
        roles: [
            {
                id: everyoneRoleId,
                serverId,
                name: '@everyone',
                position: 0,
                permissions: {
                    viewChannels: true,
                    sendMessages: true,
                    seeDeletedMessages: false, // Default false
                },
            },
            {
                id: modRoleId,
                serverId,
                name: 'Moderator',
                position: 1,
                permissions: {
                    seeDeletedMessages: true,
                },
            },
        ],
        channels: [
            {
                id: channelId,
                serverId,
                overrides: new Map(),
            },
        ],
        categories: [],
        members: [
            {
                id: new Types.ObjectId().toString(),
                serverId,
                userId: modId,
                roleIds: [modRoleId],
            },
            {
                id: new Types.ObjectId().toString(),
                serverId,
                userId,
                roleIds: [],
            },
        ],
    };

    const resolver = new PermissionResolver(mockData);

    test('Owner should be able to see deleted messages', () => {
        expect(resolver.canUserDo(ownerId.toString(), channelId.toString(), 'seeDeletedMessages')).toBe(true);
    });

    test('Moderator should be able to see deleted messages', () => {
        expect(resolver.canUserDo(modId.toString(), channelId.toString(), 'seeDeletedMessages')).toBe(true);
    });

    test('Regular user should NOT be able to see deleted messages', () => {
        expect(resolver.canUserDo(userId.toString(), channelId.toString(), 'seeDeletedMessages')).toBe(false);
    });

    test('Channel override should allow regular user to see deleted messages', () => {
        const dataWithOverride = JSON.parse(JSON.stringify(mockData));
        dataWithOverride.channels[0].overrides = new Map([
            [everyoneRoleId.toString(), { seeDeletedMessages: true }]
        ]);

        const realData: ServerData = {
            ...mockData,
            channels: [
                {
                    id: channelId,
                    serverId: serverId,
                    overrides: new Map([[everyoneRoleId.toString(), { seeDeletedMessages: true }]])
                }
            ]
        };
        const overrideResolver = new PermissionResolver(realData);
        expect(overrideResolver.canUserDo(userId.toString(), channelId.toString(), 'seeDeletedMessages')).toBe(true);
    });
});

describe('PermissionResolver - sendMessages visibility gates', () => {
    const ownerId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();
    const serverId = new Types.ObjectId().toString();
    const everyoneRoleId = new Types.ObjectId().toString();
    const categoryId = new Types.ObjectId().toString();
    const channelId = new Types.ObjectId().toString();

    const baseData: ServerData = {
        serverId,
        ownerId,
        everyoneRoleId,
        roles: [
            {
                id: everyoneRoleId,
                serverId,
                name: '@everyone',
                position: 0,
                permissions: {
                    viewCategories: true,
                    viewChannels: true,
                    sendMessages: true,
                },
            },
        ],
        channels: [
            {
                id: channelId,
                serverId,
                categoryId,
                overrides: new Map(),
            },
        ],
        categories: [
            {
                id: categoryId,
                serverId,
                overrides: new Map(),
            },
        ],
        members: [
            {
                id: new Types.ObjectId().toString(),
                serverId,
                userId,
                roleIds: [],
            },
        ],
    };

    test('denies sendMessages when channel cannot be viewed', () => {
        const resolver = new PermissionResolver({
            ...baseData,
            channels: [
                {
                    id: channelId,
                    serverId,
                    categoryId,
                    overrides: new Map([
                        [everyoneRoleId.toString(), { viewChannels: false }],
                    ]),
                },
            ],
        });

        expect(
            resolver.canUserDo(
                userId.toString(),
                channelId.toString(),
                'sendMessages',
            ),
        ).toBe(false);
    });

    test('denies sendMessages when parent category cannot be viewed', () => {
        const resolver = new PermissionResolver({
            ...baseData,
            categories: [
                {
                    id: categoryId,
                    serverId,
                    overrides: new Map([
                        [everyoneRoleId.toString(), { viewCategories: false }],
                    ]),
                },
            ],
        });

        expect(
            resolver.canUserDo(
                userId.toString(),
                channelId.toString(),
                'sendMessages',
            ),
        ).toBe(false);
    });
});
