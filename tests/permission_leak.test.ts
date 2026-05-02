import { Types } from 'mongoose';
import { PermissionResolver } from '../src/permissions/PermissionResolver';
import type { ServerData } from '../src/permissions/types';

describe('Permission Leak Test', () => {
    const serverId = new Types.ObjectId();
    const ownerId = new Types.ObjectId();
    const everyoneRoleId = new Types.ObjectId();
    const managerRoleId = new Types.ObjectId();
    const managerUserId = new Types.ObjectId();
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
                id: new Types.ObjectId(),
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
