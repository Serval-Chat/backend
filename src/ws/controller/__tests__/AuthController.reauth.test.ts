import { AuthController } from '../AuthController';

jest.mock('@/utils/botAuth', () => ({
    resolveBotAuthPayload: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/utils/sessionAuth', () => ({
    resolveSession: jest.fn().mockResolvedValue(null),
}));

const userRepo = { findById: jest.fn(), isBanned: jest.fn() };
const serverMemberRepo = { findByUserId: jest.fn() };

const wsServer = {
    getAuthenticatedUser: jest.fn(),
    authenticateConnection: jest.fn().mockResolvedValue(undefined),
    subscribeToServer: jest.fn(),
};

function controller(): AuthController {
    const instance = new AuthController(
        userRepo as never,
        serverMemberRepo as never,
    );
    (instance as unknown as { wsServer: unknown }).wsServer = wsServer;
    return instance;
}

describe('AuthController re-authentication', () => {
    const socket = {} as never;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('rejects authenticate on an already authenticated socket', async () => {
        wsServer.getAuthenticatedUser.mockReturnValue({
            userId: 'user-1',
            username: 'alice',
        });

        await expect(
            controller().onAuthenticate(
                { token: 'any-token' },
                undefined,
                socket,
            ),
        ).rejects.toMatchObject({
            status: 401,
            message: 'Already authenticated',
        });
    });

    it('does not touch connection state when it rejects', async () => {
        wsServer.getAuthenticatedUser.mockReturnValue({
            userId: 'user-1',
            username: 'alice',
        });

        await expect(
            controller().onAuthenticate(
                { token: 'any-token' },
                undefined,
                socket,
            ),
        ).rejects.toThrow();

        expect(wsServer.authenticateConnection).not.toHaveBeenCalled();
        expect(wsServer.subscribeToServer).not.toHaveBeenCalled();
        expect(userRepo.findById).not.toHaveBeenCalled();
    });

    it('still runs token verification on an unauthenticated socket', async () => {
        wsServer.getAuthenticatedUser.mockReturnValue(undefined);

        await expect(
            controller().onAuthenticate(
                { token: 'not-a-jwt' },
                undefined,
                socket,
            ),
        ).rejects.toMatchObject({
            status: 401,
            message: 'Invalid or expired token',
        });
    });
});
