import { ProfileController } from '../ProfileController';

describe('ProfileController website connections', () => {
    const userRepo = {};
    const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };
    const serverMemberRepo = {};
    const friendshipRepo = {};
    const wsServer = {};
    const imageDeliveryService = {};
    const blockRepo = {};
    const scraperService = {};
    const muteRepo = {
        checkExpired: jest.fn().mockResolvedValue(undefined),
        findActiveByUserId: jest.fn().mockResolvedValue(null),
    };
    const warningRepo = {
        hasUnacknowledged: jest.fn().mockResolvedValue(false),
    };
    const userConnectionRepo = {
        isWebsiteVerifiedByOtherUser: jest.fn(),
        isWebsiteVerifiedByUser: jest.fn(),
        startWebsiteVerification: jest.fn(),
        findAllByUser: jest.fn(),
    };

    function createController(): ProfileController {
        return new ProfileController(
            userRepo as never,
            logger as never,
            serverMemberRepo as never,
            friendshipRepo as never,
            wsServer as never,
            imageDeliveryService as never,
            blockRepo as never,
            scraperService as never,
            muteRepo as never,
            warningRepo as never,
            {} as never,
            {} as never,
            userConnectionRepo as never,
        );
    }

    beforeEach(() => {
        jest.clearAllMocks();
        muteRepo.findActiveByUserId.mockResolvedValue(null);
        warningRepo.hasUnacknowledged.mockResolvedValue(false);
        userConnectionRepo.isWebsiteVerifiedByOtherUser.mockResolvedValue(
            false,
        );
        userConnectionRepo.isWebsiteVerifiedByUser.mockResolvedValue(false);
    });

    it('starts verification and returns the saved connection id', async () => {
        userConnectionRepo.startWebsiteVerification.mockResolvedValue({
            snowflakeId: '1111111111111111111',
        });

        const result = await createController().createWebsiteConnection(
            { user: { id: 'user-1', username: 'alice' } } as never,
            { website: 'example.com' },
        );

        expect(
            userConnectionRepo.startWebsiteVerification,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 'user-1',
                normalizedValue: 'example.com',
                verificationTokenHash: expect.any(String),
                expiresAt: expect.any(Date),
            }),
        );
        expect(result.connectionId).toBe('1111111111111111111');
    });

    it.each([
        ['another user', 'isWebsiteVerifiedByOtherUser'],
        ['the same user', 'isWebsiteVerifiedByUser'],
    ] as const)(
        'rejects a website already verified by %s',
        async (_who, check) => {
            userConnectionRepo[check].mockResolvedValue(true);

            await expect(
                createController().createWebsiteConnection(
                    { user: { id: 'user-1', username: 'alice' } } as never,
                    { website: 'example.com' },
                ),
            ).rejects.toMatchObject({ status: 409 });
            expect(
                userConnectionRepo.startWebsiteVerification,
            ).not.toHaveBeenCalled();
        },
    );

    it("maps the owner's connections from the repository", async () => {
        userConnectionRepo.findAllByUser.mockResolvedValue([
            {
                snowflakeId: '2222222222222222222',
                type: 'Website',
                value: 'example.com',
                status: 'verified',
                normalizedValue: 'example.com',
            },
        ]);

        const controller = createController();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const connections = await (controller as any).getOwnConnections(
            'user-1',
        );

        expect(userConnectionRepo.findAllByUser).toHaveBeenCalledWith('user-1');
        expect(connections).toEqual([
            expect.objectContaining({
                id: '2222222222222222222',
                value: 'example.com',
                status: 'verified',
            }),
        ]);
    });
});
