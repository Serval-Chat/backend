import { Types } from 'mongoose';
import { PermissionResolver } from '../src/permissions/PermissionResolver';
import type { ServerData } from '../src/permissions/types';

describe('Permission Leak Test', () => {
    const serverId = new Types.ObjectId().toString();
    const ownerId = new Types.ObjectId().toString();
    const everyoneRoleId = new Types.ObjectId().toString();
    const managerRoleId = new Types.ObjectId().toString();
    const managerUserId = new Types.ObjectId().toString();
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
                    seeDeletedMessages: false,
                },
            },
            {
                id: managerRoleId,
                serverId,
                name: 'Manager',
                position: 1,
                permissions: {
                    manageChannels: true, // Only manageChannels
                    seeDeletedMessages: false, // Explicitly false
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
                userId: managerUserId,
                roleIds: [managerRoleId],
            },
        ],
    };

    const resolver = new PermissionResolver(mockData);

    test('User with ONLY manageChannels should NOT be able to see deleted messages', () => {
        const canSee = resolver.canUserDo(managerUserId.toString(), channelId.toString(), 'seeDeletedMessages');
        expect(canSee).toBe(false);
    });
});
