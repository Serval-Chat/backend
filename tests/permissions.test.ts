import { Types } from 'mongoose';
import { PermissionResolver } from '../src/permissions/PermissionResolver';
import type { ServerData } from '../src/permissions/types';

describe('PermissionResolver - seeDeletedMessages', () => {
    const ownerId = new Types.ObjectId();
    const modId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const serverId = new Types.ObjectId();
    const everyoneRoleId = new Types.ObjectId();
    const modRoleId = new Types.ObjectId();
    const channelId = new Types.ObjectId();

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
                id: new Types.ObjectId(),
                serverId,
                userId: modId,
                roleIds: [modRoleId],
            },
            {
                id: new Types.ObjectId(),
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
