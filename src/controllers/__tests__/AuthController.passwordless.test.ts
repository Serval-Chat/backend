import { createSession, revokeAllSessionsForUser } from '@/utils/sessionAuth';
import { ErrorMessages } from '@/constants/errorMessages';
import type { AuthenticatedRequest } from '@/middleware/auth';
import { AuthController } from '../AuthController';

jest.mock('@/utils/sessionAuth', () => ({
    createSession: jest.fn(),
    revokeAllSessionsForUser: jest.fn().mockResolvedValue(undefined),
}));

const mockCreateSession = createSession as jest.Mock;
const mockRevokeAllSessionsForUser = revokeAllSessionsForUser as jest.Mock;

describe('AuthController passwordless account guards', () => {
    let controller: AuthController;
    const logger = {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
    };
    const authService = {};
    const userRepo = {
        findById: jest.fn(),
        findByLogin: jest.fn(),
        comparePassword: jest.fn(),
        updateLogin: jest.fn(),
        updatePassword: jest.fn().mockResolvedValue(undefined),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new AuthController(
            logger,
            authService as never,
            userRepo as never,
        );
    });

    describe('changeLogin', () => {
        const req = {
            user: { id: 'user-1' },
            headers: { authorization: 'Bearer tok-1' },
        } as unknown as AuthenticatedRequest;

        it('rejects a passwordless account without attempting a password comparison', async () => {
            userRepo.findById.mockResolvedValue({
                snowflakeId: 'user-1',
                login: 'old@example.com',
                passwordless: true,
            });

            await expect(
                controller.changeLogin(req, {
                    newLogin: 'new@example.com',
                    password: 'anything',
                }),
            ).rejects.toThrow(ErrorMessages.AUTH.PASSWORDLESS_NO_PASSWORD);

            expect(userRepo.comparePassword).not.toHaveBeenCalled();
            expect(userRepo.updateLogin).not.toHaveBeenCalled();
        });

        it('still works for a normal, non-passwordless account', async () => {
            userRepo.findById
                .mockResolvedValueOnce({
                    snowflakeId: 'user-1',
                    login: 'old@example.com',
                    passwordless: false,
                })
                .mockResolvedValueOnce({
                    snowflakeId: 'user-1',
                    login: 'new@example.com',
                    passwordless: false,
                });
            userRepo.comparePassword.mockResolvedValue(true);
            userRepo.findByLogin.mockResolvedValue(null);

            const result = await controller.changeLogin(req, {
                newLogin: 'new@example.com',
                password: 'correct-pw',
            });

            expect(userRepo.updateLogin).toHaveBeenCalledWith(
                'user-1',
                'new@example.com',
            );
            expect(result.login).toBe('new@example.com');
        });
    });

    describe('changePassword', () => {
        const req = {
            user: { id: 'user-1' },
            headers: { 'user-agent': 'UA' },
            ip: '203.0.113.5',
        } as unknown as AuthenticatedRequest;

        it('rejects a passwordless account without attempting a password comparison', async () => {
            userRepo.findById.mockResolvedValue({
                snowflakeId: 'user-1',
                passwordless: true,
            });

            await expect(
                controller.changePassword(req, {
                    currentPassword: 'anything',
                    newPassword: 'brand-new-pw-1',
                }),
            ).rejects.toThrow(ErrorMessages.AUTH.PASSWORDLESS_NO_PASSWORD);

            expect(userRepo.comparePassword).not.toHaveBeenCalled();
            expect(userRepo.updatePassword).not.toHaveBeenCalled();
            expect(mockRevokeAllSessionsForUser).not.toHaveBeenCalled();
        });

        it('still works for a normal, non-passwordless account', async () => {
            userRepo.findById
                .mockResolvedValueOnce({
                    snowflakeId: 'user-1',
                    passwordless: false,
                })
                .mockResolvedValueOnce({
                    snowflakeId: 'user-1',
                    passwordless: false,
                    settings: {},
                });
            userRepo.comparePassword.mockResolvedValue(true);
            mockCreateSession.mockResolvedValue({ token: 'tok-new' });

            const result = await controller.changePassword(req, {
                currentPassword: 'old-pw',
                newPassword: 'brand-new-pw-1',
            });

            expect(userRepo.updatePassword).toHaveBeenCalledWith(
                'user-1',
                'brand-new-pw-1',
            );
            expect(mockRevokeAllSessionsForUser).toHaveBeenCalledWith('user-1');
            expect(result).toEqual({
                message: 'Password updated successfully',
                token: 'tok-new',
            });
        });
    });
});
