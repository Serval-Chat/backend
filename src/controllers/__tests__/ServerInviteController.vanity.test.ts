/* eslint-disable @typescript-eslint/no-explicit-any */
import { ServerInviteController } from '../ServerInviteController';

describe('ServerInviteController - vanity link join path', () => {
    let controller: ServerInviteController;

    const mockInviteRepo = {
        findByCode: jest.fn(),
        claimUse: jest.fn(),
        releaseUse: jest.fn(),
        create: jest.fn(),
    } as any;

    const mockVanityLinkRepo = {
        findByCode: jest.fn(),
    } as any;

    const mockServerRepo = {
        findById: jest.fn(),
    } as any;

    const mockServerMemberRepo = {
        findByServerAndUser: jest.fn(),
        countByServerId: jest.fn(),
        create: jest.fn(),
    } as any;

    const mockChannelRepo = {} as any;

    const mockRoleRepo = {
        findByServerIdAndName: jest.fn(),
    } as any;

    const mockServerBanRepo = {
        findByServerAndUser: jest.fn(),
    } as any;

    const mockPermissionService = {
        invalidateCache: jest.fn(),
        requireAnyPermission: jest.fn(),
    } as any;

    const mockLogger = {
        warn: jest.fn(),
    } as any;

    const mockWsServer = {
        subscribeUserToServer: jest.fn(),
        broadcastToServer: jest.fn(),
    } as any;

    const mockServerAuditLogService = {
        createAndBroadcast: jest.fn(),
    } as any;

    const mockUserRepo = {
        findById: jest.fn(),
    } as any;

    const mockDiscoveryService = {
        refreshServer: jest.fn(),
    } as any;

    const mockWarningRepo = {
        hasUnacknowledged: jest.fn(),
    } as any;

    const SERVER_ID = 'server1';
    const USER_ID = 'user1';

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new ServerInviteController(
            mockInviteRepo,
            mockVanityLinkRepo,
            mockServerRepo,
            mockServerMemberRepo,
            mockChannelRepo,
            mockRoleRepo,
            mockServerBanRepo,
            mockPermissionService,
            mockLogger,
            mockWsServer,
            mockServerAuditLogService,
            mockUserRepo,
            mockDiscoveryService,
            mockWarningRepo,
        );

        mockServerMemberRepo.findByServerAndUser.mockResolvedValue(null);
        mockServerBanRepo.findByServerAndUser.mockResolvedValue(null);
        mockServerRepo.findById.mockResolvedValue({
            id: SERVER_ID,
            snowflakeId: SERVER_ID,
            name: 'Test Server',
            icon: '',
            banner: undefined,
            verified: false,
            tags: [],
        });
        mockRoleRepo.findByServerIdAndName.mockResolvedValue(null);
        mockServerMemberRepo.countByServerId.mockResolvedValue(1);
        mockServerMemberRepo.create.mockResolvedValue({});
        mockUserRepo.findById.mockResolvedValue({ username: 'joiner' });
        mockInviteRepo.releaseUse.mockResolvedValue(undefined);
        mockWarningRepo.hasUnacknowledged.mockResolvedValue(false);
        mockPermissionService.requireAnyPermission.mockResolvedValue(undefined);
        mockVanityLinkRepo.findByCode.mockResolvedValue(null);
        mockInviteRepo.create.mockImplementation(
            async (data: Record<string, unknown>) => ({
                snowflakeId: 'inv-new',
                uses: 0,
                ...data,
            }),
        );
    });

    describe('getInviteDetails', () => {
        it('resolves through a vanity link when no invite matches, with no uses/maxUses/expiresAt', async () => {
            mockInviteRepo.findByCode.mockResolvedValue(null);
            mockVanityLinkRepo.findByCode.mockResolvedValue({
                serverId: SERVER_ID,
                code: 'myserver',
            });

            const result = await controller.getInviteDetails('myserver');

            expect(result.code).toBe('myserver');
            expect(result.uses).toBe(0);
            expect(result.maxUses).toBeUndefined();
            expect(result.expiresAt).toBeUndefined();
            expect(result.server.id).toBe(SERVER_ID);
        });

        it('still prefers a regular invite when both an invite and vanity link share the code', async () => {
            mockInviteRepo.findByCode.mockResolvedValue({
                serverId: SERVER_ID,
                code: 'shared',
                uses: 2,
                maxUses: 10,
            });

            const result = await controller.getInviteDetails('shared');

            expect(result.uses).toBe(2);
            expect(result.maxUses).toBe(10);
            expect(mockVanityLinkRepo.findByCode).not.toHaveBeenCalled();
        });
    });

    describe('joinServer', () => {
        it('joins via a vanity link without claiming/releasing any invite use', async () => {
            mockInviteRepo.findByCode.mockResolvedValue(null);
            mockVanityLinkRepo.findByCode.mockResolvedValue({
                serverId: SERVER_ID,
                code: 'myserver',
            });

            const result = await controller.joinServer('myserver', USER_ID);

            expect(result).toEqual({ serverId: SERVER_ID });
            expect(mockInviteRepo.claimUse).not.toHaveBeenCalled();
            expect(mockInviteRepo.releaseUse).not.toHaveBeenCalled();
            expect(mockServerMemberRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    serverId: SERVER_ID,
                    userId: USER_ID,
                }),
            );
            expect(
                mockServerAuditLogService.createAndBroadcast,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    metadata: expect.objectContaining({
                        viaVanityLink: true,
                        inviteUses: undefined,
                    }),
                }),
            );
        });

        it('still claims and releases invite uses for a regular invite join', async () => {
            const invite = {
                snowflakeId: 'inv1',
                serverId: SERVER_ID,
                code: 'inv123',
                uses: 0,
                maxUses: 0,
            };
            mockInviteRepo.findByCode.mockResolvedValue(invite);
            mockInviteRepo.claimUse.mockResolvedValue({ ...invite, uses: 1 });

            const result = await controller.joinServer('inv123', USER_ID);

            expect(result).toEqual({ serverId: SERVER_ID });
            expect(mockInviteRepo.claimUse).toHaveBeenCalledWith('inv1');
            expect(
                mockServerAuditLogService.createAndBroadcast,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    metadata: expect.objectContaining({
                        viaVanityLink: false,
                        inviteUses: 1,
                    }),
                }),
            );
        });

        it('rolls back the claimed invite use if member creation fails', async () => {
            const invite = {
                snowflakeId: 'inv1',
                serverId: SERVER_ID,
                code: 'inv123',
                uses: 0,
                maxUses: 0,
            };
            mockInviteRepo.findByCode.mockResolvedValue(invite);
            mockInviteRepo.claimUse.mockResolvedValue({ ...invite, uses: 1 });
            mockServerMemberRepo.create.mockRejectedValue(new Error('boom'));

            await expect(
                controller.joinServer('inv123', USER_ID),
            ).rejects.toThrow('boom');

            expect(mockInviteRepo.releaseUse).toHaveBeenCalledWith('inv1');
        });

        it('does not attempt to release a use if member creation fails on a vanity join', async () => {
            mockInviteRepo.findByCode.mockResolvedValue(null);
            mockVanityLinkRepo.findByCode.mockResolvedValue({
                serverId: SERVER_ID,
                code: 'myserver',
            });
            mockServerMemberRepo.create.mockRejectedValue(new Error('boom'));

            await expect(
                controller.joinServer('myserver', USER_ID),
            ).rejects.toThrow('boom');

            expect(mockInviteRepo.releaseUse).not.toHaveBeenCalled();
        });
    });

    describe('createInvite - avoiding vanity-link code collisions', () => {
        it('creates an invite with a freshly generated code when there is no collision', async () => {
            const result = await controller.createInvite(
                SERVER_ID,
                USER_ID,
                'creator',
                {},
            );

            expect(mockVanityLinkRepo.findByCode).toHaveBeenCalledTimes(1);
            expect(mockInviteRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    serverId: SERVER_ID,
                    code: result.code,
                }),
            );
        });

        it('regenerates the code when it collides with an existing vanity link', async () => {
            mockVanityLinkRepo.findByCode
                .mockResolvedValueOnce({
                    serverId: 'someOtherServer',
                    code: 'x',
                })
                .mockResolvedValueOnce(null);

            await controller.createInvite(SERVER_ID, USER_ID, 'creator', {});

            expect(mockVanityLinkRepo.findByCode).toHaveBeenCalledTimes(2);
            expect(mockInviteRepo.create).toHaveBeenCalledTimes(1);
        });

        it('gives up after 5 collisions instead of looping forever', async () => {
            mockVanityLinkRepo.findByCode.mockResolvedValue({
                serverId: 'someOtherServer',
                code: 'x',
            });

            await expect(
                controller.createInvite(SERVER_ID, USER_ID, 'creator', {}),
            ).rejects.toThrow(/unique invite code/i);

            expect(mockInviteRepo.create).not.toHaveBeenCalled();
        });
    });
});
