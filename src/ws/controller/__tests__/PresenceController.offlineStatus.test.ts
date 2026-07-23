import { PresenceController } from '../PresenceController';

describe('PresenceController manual offline (invisible) status', () => {
    const userRepo = {
        findById: jest.fn(),
        findByIds: jest.fn(),
        updateCustomStatus: jest.fn(),
        updatePresenceStatus: jest.fn(),
    };
    const friendshipRepo = {
        findByUserId: jest.fn(),
    };
    const serverMemberRepo = {
        findServerIdsByUserId: jest.fn(),
        findUserIdsInServerIds: jest.fn(),
    };
    const blockRepo = {
        findBlocksByBlocker: jest.fn().mockResolvedValue([]),
        findBlocksByTarget: jest.fn().mockResolvedValue([]),
    };
    const muteRepo = {
        checkExpired: jest.fn().mockResolvedValue(undefined),
        findActiveByUserId: jest.fn().mockResolvedValue(null),
    };
    const warningRepo = {
        hasUnacknowledged: jest.fn().mockResolvedValue(false),
    };
    const wsServer = {
        isUserOnline: jest.fn().mockResolvedValue(true),
        broadcastToUser: jest.fn(),
        broadcastToPresenceAudience: jest.fn(),
    };

    function createController(): PresenceController {
        const controller = new PresenceController(
            userRepo as never,
            friendshipRepo as never,
            serverMemberRepo as never,
            blockRepo as never,
            muteRepo as never,
            warningRepo as never,
        );
        (controller as unknown as { wsServer: typeof wsServer }).wsServer =
            wsServer;
        return controller;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        blockRepo.findBlocksByBlocker.mockResolvedValue([]);
        blockRepo.findBlocksByTarget.mockResolvedValue([]);
        wsServer.isUserOnline.mockResolvedValue(true);
        userRepo.updatePresenceStatus.mockResolvedValue(undefined);
        friendshipRepo.findByUserId.mockResolvedValue([
            { userId: 'actor', friendId: 'friend-1' },
        ]);
        serverMemberRepo.findServerIdsByUserId.mockResolvedValue(['server-1']);
    });

    describe('sendPresenceSync', () => {
        it('excludes a connected friend who set themselves to offline', async () => {
            friendshipRepo.findByUserId.mockResolvedValue([
                { userId: 'viewer', friendId: 'invisible-friend' },
            ]);
            serverMemberRepo.findServerIdsByUserId.mockResolvedValue([]);
            userRepo.findByIds.mockResolvedValue([
                {
                    snowflakeId: 'invisible-friend',
                    username: 'invisibleFriend',
                    customStatus: null,
                    presenceStatus: 'offline',
                },
            ]);

            const controller = createController();
            await controller.sendPresenceSync({
                userId: 'viewer',
                username: 'viewer',
            } as never);

            const call = wsServer.broadcastToUser.mock.calls.find(
                (c) => c[0] === 'viewer',
            );
            expect(call).toBeDefined();
            const online = call?.[1].payload.online as Array<{
                userId: string;
            }>;
            expect(
                online.find((u) => u.userId === 'invisible-friend'),
            ).toBeUndefined();
        });

        it('still includes a connected friend with a visible mode (dnd)', async () => {
            friendshipRepo.findByUserId.mockResolvedValue([
                { userId: 'viewer', friendId: 'dnd-friend' },
            ]);
            serverMemberRepo.findServerIdsByUserId.mockResolvedValue([]);
            userRepo.findByIds.mockResolvedValue([
                {
                    snowflakeId: 'dnd-friend',
                    username: 'dndFriend',
                    customStatus: null,
                    presenceStatus: 'dnd',
                },
            ]);

            const controller = createController();
            await controller.sendPresenceSync({
                userId: 'viewer',
                username: 'viewer',
            } as never);

            const call = wsServer.broadcastToUser.mock.calls.find(
                (c) => c[0] === 'viewer',
            );
            const online = call?.[1].payload.online as Array<{
                userId: string;
                presenceStatus: string;
            }>;
            const entry = online.find((u) => u.userId === 'dnd-friend');
            expect(entry).toBeDefined();
            expect(entry?.presenceStatus).toBe('dnd');
        });
    });

    describe('broadcastUserOnline', () => {
        it('does not announce a user connecting while set to offline/invisible', async () => {
            userRepo.findById.mockResolvedValue({
                presenceStatus: 'offline',
                customStatus: null,
                privacySettings: {},
            });

            const controller = createController();
            await controller.broadcastUserOnline('actor', 'actorUsername');

            expect(wsServer.broadcastToPresenceAudience).not.toHaveBeenCalled();
        });

        it('announces a user connecting normally', async () => {
            userRepo.findById.mockResolvedValue({
                presenceStatus: 'online',
                customStatus: null,
                privacySettings: {},
            });

            const controller = createController();
            await controller.broadcastUserOnline('actor', 'actorUsername');

            expect(wsServer.broadcastToPresenceAudience).toHaveBeenCalled();
        });
    });

    describe('onSetPresenceStatus', () => {
        it('broadcasts user_offline (not presence_status_updated) when going invisible', async () => {
            userRepo.findById.mockResolvedValue({ presenceStatus: 'online' });

            const controller = createController();
            await controller.onSetPresenceStatus({ status: 'offline' }, {
                userId: 'actor',
                username: 'actorUsername',
            } as never);

            expect(userRepo.updatePresenceStatus).toHaveBeenCalledWith(
                'actor',
                'offline',
            );

            const calls = wsServer.broadcastToPresenceAudience.mock.calls;
            expect(calls).toHaveLength(1);
            const [friendIds, serverIds, event] = calls[0] as [
                string[],
                string[],
                { type: string },
            ];
            expect(friendIds).toContain('friend-1');
            expect(serverIds).toContain('server-1');
            expect(event.type).toBe('user_offline');
        });

        it('broadcasts user_online (not presence_status_updated) when coming back from invisible', async () => {
            userRepo.findById.mockResolvedValue({
                presenceStatus: 'offline',
                customStatus: {
                    text: 'back',
                    emoji: null,
                    expiresAt: null,
                    updatedAt: new Date(),
                },
                privacySettings: {},
            });

            const controller = createController();
            await controller.onSetPresenceStatus({ status: 'idle' }, {
                userId: 'actor',
                username: 'actorUsername',
            } as never);

            expect(userRepo.updatePresenceStatus).toHaveBeenCalledWith(
                'actor',
                'idle',
            );

            const calls = wsServer.broadcastToPresenceAudience.mock.calls;
            expect(calls).toHaveLength(1);
            const [, , event] = calls[0] as [
                string[],
                string[],
                {
                    type: string;
                    payload: { presenceStatus: string; status: unknown };
                },
            ];
            expect(event.type).toBe('user_online');
            expect(event.payload.presenceStatus).toBe('idle');
            expect(event.payload.status).not.toBeNull();
        });

        it('hides customStatus from non-friend server members when coming back online with hideStatus set', async () => {
            userRepo.findById.mockResolvedValue({
                presenceStatus: 'offline',
                customStatus: {
                    text: 'secret',
                    emoji: null,
                    expiresAt: null,
                    updatedAt: new Date(),
                },
                privacySettings: { hideStatus: true },
            });

            const controller = createController();
            await controller.onSetPresenceStatus({ status: 'online' }, {
                userId: 'actor',
                username: 'actorUsername',
            } as never);

            const calls = wsServer.broadcastToPresenceAudience.mock.calls;

            const friendCall = calls.find((c) =>
                (c[0] as string[]).includes('friend-1'),
            );
            expect(friendCall).toBeDefined();
            expect(
                (friendCall?.[2] as { payload: { status: unknown } }).payload
                    .status,
            ).not.toBeNull();

            const serverCall = calls.find((c) =>
                (c[1] as string[]).includes('server-1'),
            );
            expect(serverCall).toBeDefined();
            expect(
                (serverCall?.[2] as { payload: { status: unknown } }).payload
                    .status,
            ).toBeNull();
        });

        it('still broadcasts presence_status_updated for switches between visible modes', async () => {
            userRepo.findById.mockResolvedValue({ presenceStatus: 'online' });

            const controller = createController();
            await controller.onSetPresenceStatus({ status: 'dnd' }, {
                userId: 'actor',
                username: 'actorUsername',
            } as never);

            const calls = wsServer.broadcastToPresenceAudience.mock.calls;
            expect(calls).toHaveLength(1);
            const [, , event] = calls[0] as [
                string[],
                string[],
                { type: string; payload: { presenceStatus: string } },
            ];
            expect(event.type).toBe('presence_status_updated');
            expect(event.payload.presenceStatus).toBe('dnd');
        });

        it('does not broadcast anything when already offline and staying offline', async () => {
            userRepo.findById.mockResolvedValue({ presenceStatus: 'offline' });

            const controller = createController();
            await controller.onSetPresenceStatus({ status: 'offline' }, {
                userId: 'actor',
                username: 'actorUsername',
            } as never);

            expect(userRepo.updatePresenceStatus).toHaveBeenCalledWith(
                'actor',
                'offline',
            );
            expect(wsServer.broadcastToPresenceAudience).not.toHaveBeenCalled();
        });
    });
});
