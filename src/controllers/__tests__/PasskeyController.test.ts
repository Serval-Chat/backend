import type { Request, Response } from 'express';
import { createSession } from '@/utils/sessionAuth';
import type { JWTPayload } from '@/utils/jwt';
import { PasskeyController } from '../PasskeyController';

jest.mock('@/utils/sessionAuth', () => ({
    createSession: jest.fn(),
}));

const mockCreateSession = createSession as jest.Mock;

function mockResponse(): Response {
    const res = {} as Response;
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

describe('PasskeyController', () => {
    let controller: PasskeyController;
    const passkeyService = {
        listCredentials: jest.fn(),
        generateRegistrationOptions: jest.fn(),
        verifyRegistration: jest.fn(),
        renameCredential: jest.fn(),
        removeCredential: jest.fn(),
        generateAuthenticationOptions: jest.fn(),
        verifyAuthentication: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new PasskeyController(passkeyService as never);
    });

    describe('management endpoints', () => {
        it('listPasskeys delegates to the service with the current user id', async () => {
            passkeyService.listCredentials.mockResolvedValue([{ id: 'pk-1' }]);

            const result = await controller.listPasskeys('user-1');

            expect(passkeyService.listCredentials).toHaveBeenCalledWith(
                'user-1',
            );
            expect(result).toEqual({ passkeys: [{ id: 'pk-1' }] });
        });

        it('startRegistration passes the current user id/login/username', async () => {
            passkeyService.generateRegistrationOptions.mockResolvedValue({
                challenge: 'c',
            });
            const user: JWTPayload = {
                id: 'user-1',
                login: 'user@example.com',
                username: 'user1',
            };

            const result = await controller.startRegistration(user);

            expect(
                passkeyService.generateRegistrationOptions,
            ).toHaveBeenCalledWith('user-1', 'user@example.com', 'user1');
            expect(result).toEqual({ options: { challenge: 'c' } });
        });

        it('verifyRegistration passes the current user id, not any client-supplied id', async () => {
            passkeyService.verifyRegistration.mockResolvedValue({
                id: 'pk-1',
            });

            const result = await controller.verifyRegistration('user-1', {
                credential: {} as never,
                name: 'My key',
            });

            expect(passkeyService.verifyRegistration).toHaveBeenCalledWith(
                'user-1',
                {},
                'My key',
            );
            expect(result).toEqual({ passkey: { id: 'pk-1' } });
        });

        it('renamePasskey delegates with the credential id and new name', async () => {
            passkeyService.renameCredential.mockResolvedValue({
                id: 'pk-1',
                name: 'New',
            });

            const result = await controller.renamePasskey('user-1', 'pk-1', {
                name: 'New',
            });

            expect(passkeyService.renameCredential).toHaveBeenCalledWith(
                'user-1',
                'pk-1',
                'New',
            );
            expect(result).toEqual({ id: 'pk-1', name: 'New' });
        });

        it('removePasskey delegates and lets the service 404 propagate', async () => {
            passkeyService.removeCredential.mockRejectedValue(
                new Error('Passkey not found'),
            );

            await expect(
                controller.removePasskey('user-1', 'missing'),
            ).rejects.toThrow('Passkey not found');
        });
    });

    describe('startLogin', () => {
        it('returns the service flowId/options untouched', async () => {
            passkeyService.generateAuthenticationOptions.mockResolvedValue({
                flowId: 'flow-1',
                options: { challenge: 'c' },
            });

            const result = await controller.startLogin();

            expect(result).toEqual({
                flowId: 'flow-1',
                options: { challenge: 'c' },
            });
        });
    });

    describe('verifyLogin', () => {
        const body = { flowId: 'flow-1', credential: {} as never };
        const req = {
            headers: { 'user-agent': 'UA' },
            ip: '203.0.113.5',
        } as unknown as Request;

        it('creates a session and responds 200 on success', async () => {
            passkeyService.verifyAuthentication.mockResolvedValue({
                success: true,
                user: {
                    snowflakeId: 'user-1',
                    username: 'user1',
                    settings: {},
                },
            });
            mockCreateSession.mockResolvedValue({ token: 'tok-1' });
            const res = mockResponse();

            await controller.verifyLogin(body, req, res);

            expect(mockCreateSession).toHaveBeenCalledWith(
                'user-1',
                'UA',
                '203.0.113.5',
                '30d',
            );
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                token: 'tok-1',
                username: 'user1',
            });
        });

        it('responds 403 with the ban shape and never creates a session', async () => {
            passkeyService.verifyAuthentication.mockResolvedValue({
                success: false,
                error: 'Your account has been banned',
                ban: { reason: 'spam' },
            });
            const res = mockResponse();

            await controller.verifyLogin(body, req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                error: 'Your account has been banned',
                ban: { reason: 'spam' },
            });
            expect(mockCreateSession).not.toHaveBeenCalled();
        });

        it('responds 401 on a generic failure and never creates a session', async () => {
            passkeyService.verifyAuthentication.mockResolvedValue({
                success: false,
                error: 'Invalid credentials',
            });
            const res = mockResponse();

            await controller.verifyLogin(body, req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                error: 'Invalid credentials',
            });
            expect(mockCreateSession).not.toHaveBeenCalled();
        });
    });
});
