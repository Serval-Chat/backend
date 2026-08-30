import { ErrorMessages } from '@/constants/errorMessages';
import { AuthService } from '../AuthService';

const logger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
};

function makeService(overrides: {
    userRepo?: Record<string, jest.Mock>;
    banRepo?: Record<string, jest.Mock>;
    passwordResetRepo?: Record<string, jest.Mock>;
    mailService?: Record<string, jest.Mock>;
}) {
    const userRepo = {
        findByLogin: jest.fn(),
        findById: jest.fn(),
        comparePassword: jest.fn(),
        updatePassword: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
        ...overrides.userRepo,
    };
    const banRepo = {
        checkExpired: jest.fn().mockResolvedValue(undefined),
        findActiveByUserId: jest.fn().mockResolvedValue(null),
        ...overrides.banRepo,
    };
    const passwordResetRepo = {
        findByHashedToken: jest.fn(),
        markAsUsed: jest.fn().mockResolvedValue(true),
        deleteByUser: jest.fn().mockResolvedValue(undefined),
        createIfUnderLimit: jest.fn().mockResolvedValue({}),
        ...overrides.passwordResetRepo,
    };
    const mailService = {
        sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
        sendPasswordChangedNotification: jest.fn().mockResolvedValue(undefined),
        ...overrides.mailService,
    };

    const service = new AuthService(
        logger,
        userRepo as never,
        banRepo as never,
        passwordResetRepo as never,
        mailService as never,
        { increment: jest.fn() },
        { create: jest.fn().mockResolvedValue(undefined) } as never,
    );

    return { service, userRepo, banRepo, passwordResetRepo, mailService };
}

describe('AuthService passwordless account guards', () => {
    describe('login', () => {
        it('rejects a passwordless account without attempting to compare a password', async () => {
            const { service, userRepo } = makeService({
                userRepo: {
                    findByLogin: jest.fn().mockResolvedValue({
                        snowflakeId: 'user-1',
                        passwordless: true,
                    }),
                },
            });

            const result = await service.login('user@example.com', 'anything');

            expect(result).toEqual({
                success: false,
                error: ErrorMessages.AUTH.INVALID_CREDENTIALS,
            });
            expect(userRepo.comparePassword).not.toHaveBeenCalled();
        });

        it('still logs in a normal, non-passwordless account', async () => {
            const { service } = makeService({
                userRepo: {
                    findByLogin: jest.fn().mockResolvedValue({
                        snowflakeId: 'user-1',
                        passwordless: false,
                    }),
                    comparePassword: jest.fn().mockResolvedValue(true),
                },
            });

            const result = await service.login('user@example.com', 'pw');

            expect(result.success).toBe(true);
        });
    });

    describe('requestPasswordReset', () => {
        it('silently returns a requestId for a passwordless account, without sending an email or creating a reset record', async () => {
            const { service, passwordResetRepo, mailService } = makeService({
                userRepo: {
                    findByLogin: jest.fn().mockResolvedValue({
                        snowflakeId: 'user-1',
                        passwordless: true,
                    }),
                },
            });

            const requestId = await service.requestPasswordReset(
                'user@example.com',
                '1.2.3.4',
            );

            expect(typeof requestId).toBe('string');
            expect(passwordResetRepo.createIfUnderLimit).not.toHaveBeenCalled();
            expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
        });

        it('is indistinguishable in shape from the non-existent-user response', async () => {
            const notFound = makeService({
                userRepo: { findByLogin: jest.fn().mockResolvedValue(null) },
            });
            const passwordless = makeService({
                userRepo: {
                    findByLogin: jest.fn().mockResolvedValue({
                        snowflakeId: 'user-1',
                        passwordless: true,
                    }),
                },
            });

            const notFoundId = await notFound.service.requestPasswordReset(
                'nobody@example.com',
                '1.2.3.4',
            );
            const passwordlessId =
                await passwordless.service.requestPasswordReset(
                    'user@example.com',
                    '1.2.3.4',
                );

            expect(typeof notFoundId).toBe('string');
            expect(typeof passwordlessId).toBe('string');
            expect(
                passwordless.passwordResetRepo.createIfUnderLimit,
            ).not.toHaveBeenCalled();
            expect(
                notFound.passwordResetRepo.createIfUnderLimit,
            ).not.toHaveBeenCalled();
        });
    });

    describe('confirmPasswordReset', () => {
        it('rejects a token belonging to a passwordless account, without marking it used or updating the password', async () => {
            const { service, passwordResetRepo, userRepo } = makeService({
                userRepo: {
                    findById: jest.fn().mockResolvedValue({
                        snowflakeId: 'user-1',
                        passwordless: true,
                    }),
                },
                passwordResetRepo: {
                    findByHashedToken: jest
                        .fn()
                        .mockResolvedValue({ userId: 'user-1' }),
                },
            });

            await expect(
                service.confirmPasswordReset('a'.repeat(64), 'NewP@ssw0rd1'),
            ).rejects.toThrow(ErrorMessages.AUTH.INVALID_RESET_TOKEN);

            expect(passwordResetRepo.markAsUsed).not.toHaveBeenCalled();
            expect(userRepo.updatePassword).not.toHaveBeenCalled();
        });

        it('still completes for a normal, non-passwordless account', async () => {
            const { service } = makeService({
                userRepo: {
                    findById: jest.fn().mockResolvedValue({
                        snowflakeId: 'user-1',
                        passwordless: false,
                    }),
                    comparePassword: jest.fn().mockResolvedValue(false),
                },
                passwordResetRepo: {
                    findByHashedToken: jest
                        .fn()
                        .mockResolvedValue({ userId: 'user-1' }),
                },
            });

            const result = await service.confirmPasswordReset(
                'a'.repeat(64),
                'NewP@ssw0rd1',
            );

            expect(result.userId).toBe('user-1');
        });
    });
});
