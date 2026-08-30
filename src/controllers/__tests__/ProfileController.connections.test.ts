import { UserConnection } from '@/models/UserConnection';
import { ProfileController } from '../ProfileController';

jest.mock('@/models/UserConnection', () => {
    const findOne = jest.fn();
    const find = jest.fn();

    const MockUserConnection = jest.fn().mockImplementation(function (
        this: Record<string, unknown>,
        data: Record<string, unknown>,
    ) {
        Object.assign(this, data);
        this.save = jest.fn().mockImplementation(async () => {
            if (this.snowflakeId === undefined) {
                this.snowflakeId = '1111111111111111111';
            }
            return this;
        });
        return this;
    });

    return {
        UserConnection: Object.assign(MockUserConnection, { findOne, find }),
    };
});

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
        );
    }

    beforeEach(() => {
        jest.clearAllMocks();
        muteRepo.findActiveByUserId.mockResolvedValue(null);
        warningRepo.hasUnacknowledged.mockResolvedValue(false);
    });

    it('creates a pending connection via save() so it gets a real snowflakeId immediately', async () => {
        (UserConnection.findOne as jest.Mock).mockReturnValue({
            lean: jest.fn().mockReturnThis(),
            exec: jest.fn().mockResolvedValue(null),
        });

        const result = await createController().createWebsiteConnection(
            { user: { id: 'user-1', username: 'alice' } } as never,
            { website: 'example.com' },
        );

        expect(UserConnection).toHaveBeenCalledTimes(1);
        expect(result.connectionId).toBe('1111111111111111111');
    });

    it('self-heals existing connections that are missing a snowflakeId when the owner fetches their connections', async () => {
        const brokenSave = jest.fn().mockImplementation(async function (
            this: Record<string, unknown>,
        ) {
            this.snowflakeId = '2222222222222222222';
            return this;
        });
        const healthySave = jest.fn();

        const brokenConnection = {
            snowflakeId: undefined,
            type: 'Website',
            value: 'broken.example',
            status: 'pending',
            normalizedValue: 'broken.example',
            save: brokenSave,
        };
        const healthyConnection = {
            snowflakeId: '3333333333333333333',
            type: 'Website',
            value: 'healthy.example',
            status: 'verified',
            normalizedValue: 'healthy.example',
            save: healthySave,
        };

        (UserConnection.find as jest.Mock).mockReturnValue({
            sort: jest.fn().mockReturnValue({
                exec: jest
                    .fn()
                    .mockResolvedValue([brokenConnection, healthyConnection]),
            }),
        });

        const controller = createController();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const connections = await (controller as any).getOwnConnections(
            'user-1',
        );

        expect(brokenSave).toHaveBeenCalledTimes(1);
        expect(healthySave).not.toHaveBeenCalled();
        expect(
            connections.find(
                (c: { value: string }) => c.value === 'broken.example',
            ).id,
        ).toBe('2222222222222222222');
    });
});
