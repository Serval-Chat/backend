import type { Request, Response } from 'express';
import { createSession, revokeAllSessionsForUser } from '@/utils/sessionAuth';
import { verifyTurnstile } from '@/utils/turnstile';
import { PasswordlessController } from '../PasswordlessController';

jest.mock('@/utils/sessionAuth', () => ({
    createSession: jest.fn(),
    revokeAllSessionsForUser: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/utils/turnstile', () => ({
    verifyTurnstile: jest.fn().mockResolvedValue(true),
}));

const mockCreateSession = createSession as jest.Mock;
const mockRevokeAllSessionsForUser = revokeAllSessionsForUser as jest.Mock;
const mockVerifyTurnstile = verifyTurnstile as jest.Mock;

function mockResponse(): Response {
    const res = {} as Response;
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

describe('PasswordlessController', () => {
    let controller: PasswordlessController;
    const passwordlessService = {
        enable: jest.fn(),
        regenerateRecoveryKeysOptions: jest.fn(),
        regenerateRecoveryKeysVerify: jest.fn(),
        loginWithRecoveryKey: jest.fn(),
    };
    const userRepo = {
        findById: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockVerifyTurnstile.mockResolvedValue(true);
        controller = new PasswordlessController(
            passwordlessService as never,
            userRepo as never,
        );
    });

    describe('enable', () => {
        const req = {
            headers: { 'user-agent': 'UA' },
            ip: '203.0.113.5',
        } as unknown as Request;

        it('revokes sessions and issues a fresh one after enabling', async () => {
            const calls: string[] = [];
            passwordlessService.enable.mockImplementation(async () => {
                calls.push('enable');
                return ['CODE-0001', 'CODE-0002'];
            });
            mockRevokeAllSessionsForUser.mockImplementation(async () => {
                calls.push('revoke');
            });
            userRepo.findById.mockImplementation(async () => {
                calls.push('findById');
                return {
                    snowflakeId: 'user-1',
                    username: 'user1',
                    settings: {},
                };
            });
            mockCreateSession.mockImplementation(async () => {
                calls.push('createSession');
                return { token: 'tok-new' };
            });

            const result = await controller.enable('user-1', req, {
                password: 'current-pw',
            });

            expect(passwordlessService.enable).toHaveBeenCalledWith(
                'user-1',
                'current-pw',
            );
            expect(calls).toEqual([
                'enable',
                'revoke',
                'findById',
                'createSession',
            ]);
            expect(result).toEqual({
                recoveryKeys: ['CODE-0001', 'CODE-0002'],
                token: 'tok-new',
            });
        });
    });

    describe('regenerateRecoveryKeysOptions', () => {
        it('returns the service result untouched', async () => {
            passwordlessService.regenerateRecoveryKeysOptions.mockResolvedValue(
                { flowId: 'flow-1', options: { challenge: 'c' } },
            );

            const result = await controller.regenerateRecoveryKeysOptions();

            expect(result).toEqual({
                flowId: 'flow-1',
                options: { challenge: 'c' },
            });
        });
    });

    describe('regenerateRecoveryKeysVerify', () => {
        it('delegates with the current user id, flowId, and credential', async () => {
            passwordlessService.regenerateRecoveryKeysVerify.mockResolvedValue([
                'CODE-NEW1',
            ]);

            const result = await controller.regenerateRecoveryKeysVerify(
                'user-1',
                { flowId: 'flow-1', credential: { id: 'cred-1' } as never },
            );

            expect(
                passwordlessService.regenerateRecoveryKeysVerify,
            ).toHaveBeenCalledWith('user-1', 'flow-1', { id: 'cred-1' });
            expect(result).toEqual({ recoveryKeys: ['CODE-NEW1'] });
        });
    });

    describe('recover', () => {
        const body = {
            login: 'user@example.com',
            recoveryKey: 'ABCD-1234',
            cfTurnstileResponse: 'tok',
        };
        const req = {
            headers: { 'user-agent': 'UA' },
            ip: '203.0.113.5',
        } as unknown as Request;

        it('rejects with 400 when the captcha fails, without calling the service', async () => {
            mockVerifyTurnstile.mockResolvedValue(false);
            const res = mockResponse();

            await controller.recover(body, req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(
                passwordlessService.loginWithRecoveryKey,
            ).not.toHaveBeenCalled();
        });

        it('creates a session and responds 200 on success', async () => {
            passwordlessService.loginWithRecoveryKey.mockResolvedValue({
                success: true,
                user: {
                    snowflakeId: 'user-1',
                    username: 'user1',
                    settings: {},
                },
            });
            mockCreateSession.mockResolvedValue({ token: 'tok-1' });
            const res = mockResponse();

            await controller.recover(body, req, res);

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
            passwordlessService.loginWithRecoveryKey.mockResolvedValue({
                success: false,
                error: 'Your account has been banned',
                ban: { reason: 'spam' },
            });
            const res = mockResponse();

            await controller.recover(body, req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                error: 'Your account has been banned',
                ban: { reason: 'spam' },
            });
            expect(mockCreateSession).not.toHaveBeenCalled();
        });

        it('responds 401 on a generic failure and never creates a session', async () => {
            passwordlessService.loginWithRecoveryKey.mockResolvedValue({
                success: false,
                error: 'Invalid credentials',
            });
            const res = mockResponse();

            await controller.recover(body, req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                error: 'Invalid credentials',
            });
            expect(mockCreateSession).not.toHaveBeenCalled();
        });
    });
});
