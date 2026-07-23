import { PresenceController } from '../PresenceController';

describe('PresenceController hideStatus privacy', () => {
    const userRepo = {
        findById: jest.fn(),
        findByIds: jest.fn(),
        updateCustomStatus: jest.fn(),
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
    });

    describe('sendPresenceSync', () => {
        it('does not reveal customStatus of a non-friend server member who set hideStatus', async () => {
            friendshipRepo.findByUserId.mockResolvedValue([]);
            serverMemberRepo.findServerIdsByUserId.mockResolvedValue([
                'server-1',
            ]);
            serverMemberRepo.findUserIdsInServerIds.mockResolvedValue([
                'hidden-user',
            ]);
            userRepo.findByIds.mockResolvedValue([
                {
                    snowflakeId: 'hidden-user',
                    username: 'hiddenUser',
                    customStatus: {
                        text: 'secret status',
                        emoji: null,
                        expiresAt: null,
                        updatedAt: new Date(),
                    },
                    presenceStatus: 'online',
                    privacySettings: { hideStatus: true },
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
                status: unknown;
            }>;
            const hiddenEntry = online.find((u) => u.userId === 'hidden-user');
            expect(hiddenEntry?.status).toBeNull();
        });
    });

    describe('broadcastUserOnline', () => {
        it('reveals customStatus to friends but hides it from non-friend server members', async () => {
            userRepo.findById.mockResolvedValue({
                customStatus: {
                    text: 'secret status',
                    emoji: null,
                    expiresAt: null,
                    updatedAt: new Date(),
                },
                presenceStatus: 'online',
                privacySettings: { hideStatus: true },
            });
            friendshipRepo.findByUserId.mockResolvedValue([
                { userId: 'actor', friendId: 'friend-1' },
            ]);
            serverMemberRepo.findServerIdsByUserId.mockResolvedValue([
                'server-1',
            ]);

            const controller = createController();
            await controller.broadcastUserOnline('actor', 'actorUsername');

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
    });

    describe('onSetStatus', () => {
        it('reveals the new status to friends but hides it from non-friend server members', async () => {
            userRepo.updateCustomStatus.mockResolvedValue(undefined);
            userRepo.findById.mockResolvedValue({
                privacySettings: { hideStatus: true },
            });
            friendshipRepo.findByUserId.mockResolvedValue([
                { userId: 'actor', friendId: 'friend-1' },
            ]);
            serverMemberRepo.findServerIdsByUserId.mockResolvedValue([
                'server-1',
            ]);

            const controller = createController();
            await controller.onSetStatus({ status: 'secret status' }, {
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

        it('reveals the new status to everyone when hideStatus is not set', async () => {
            userRepo.updateCustomStatus.mockResolvedValue(undefined);
            userRepo.findById.mockResolvedValue({ privacySettings: {} });
            friendshipRepo.findByUserId.mockResolvedValue([
                { userId: 'actor', friendId: 'friend-1' },
            ]);
            serverMemberRepo.findServerIdsByUserId.mockResolvedValue([
                'server-1',
            ]);

            const controller = createController();
            await controller.onSetStatus({ status: 'public status' }, {
                userId: 'actor',
                username: 'actorUsername',
            } as never);

            const calls = wsServer.broadcastToPresenceAudience.mock.calls;
            expect(calls).toHaveLength(1);
            expect(
                (calls[0]?.[0] as string[] | undefined)?.includes('friend-1'),
            ).toBe(true);
            expect(
                (calls[0]?.[1] as string[] | undefined)?.includes('server-1'),
            ).toBe(true);
            expect(
                (calls[0]?.[2] as { payload: { status: unknown } }).payload
                    .status,
            ).not.toBeNull();
        });
    });
});
