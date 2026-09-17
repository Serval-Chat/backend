import { ServerController } from '../ServerController';

describe('ServerController.createServer', () => {
    const USER_ID = 'user1';

    const mockServerRepo = {
        create: jest.fn(),
    };
    const mockServerMemberRepo = {
        create: jest.fn(),
    };
    const mockChannelRepo = {
        create: jest.fn(),
    };
    const mockRoleRepo = {
        create: jest.fn(),
    };
    const mockUserRepo = {};
    const mockInviteRepo = {};
    const mockVanityLinkRepo = {};
    const mockServerMessageRepo = {};
    const mockServerBanRepo = {};
    const mockServerChannelReadRepo = {};
    const mockPermissionService = {
        invalidateCache: jest.fn(),
    };
    const mockWsServer = {
        broadcastToServer: jest.fn(),
    };
    const mockPingService = {};
    const mockLogger = {
        warn: jest.fn(),
        error: jest.fn(),
    };
    const mockAuditLogRepo = {};
    const mockServerAuditLogService = {
        createAndBroadcast: jest.fn(),
    };
    const mockRedisService = {};
    const mockDiscoveryService = {
        refreshServer: jest.fn(),
    };

    let controller: ServerController;

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new ServerController(
            mockServerRepo as never,
            mockServerMemberRepo as never,
            mockChannelRepo as never,
            mockRoleRepo as never,
            mockUserRepo as never,
            mockInviteRepo as never,
            mockVanityLinkRepo as never,
            mockServerMessageRepo as never,
            mockServerBanRepo as never,
            mockServerChannelReadRepo as never,
            mockPermissionService as never,
            mockWsServer as never,
            mockPingService as never,
            mockLogger as never,
            mockAuditLogRepo as never,
            mockServerAuditLogService,
            mockRedisService as never,
            mockDiscoveryService as never,
        );

        mockServerRepo.create.mockResolvedValue({
            id: 'server1',
            name: 'Test Server',
        });
        mockRoleRepo.create.mockResolvedValue({});
        mockChannelRepo.create.mockResolvedValue({ id: 'channel1' });
        mockServerMemberRepo.create.mockResolvedValue({});
    });

    it('adds the creator as a member without setting joinedVia', async () => {
        await controller.createServer(USER_ID, { name: 'Test Server' });

        expect(mockServerMemberRepo.create).toHaveBeenCalledWith({
            serverId: 'server1',
            userId: USER_ID,
            roles: [],
        });

        const callArgs = mockServerMemberRepo.create.mock.calls[0]?.[0];
        expect(callArgs).not.toHaveProperty('joinedVia');
    });
});
