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
    passwordResetRepo?: Record<string, jest.Mock>;
}) {
    const userRepo = {
        findByLogin: jest.fn(),
        findById: jest.fn(),
        comparePassword: jest.fn(),
        updatePassword: jest.fn().mockResolvedValue(undefined),
        incrementTokenVersion: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
        ...overrides.userRepo,
    };
    const passwordResetRepo = {
        findByHashedToken: jest.fn(),
        markAsUsed: jest.fn().mockResolvedValue(true),
        deleteByUser: jest.fn().mockResolvedValue(undefined),
        ...overrides.passwordResetRepo,
    };

    const service = new AuthService(
        logger,
        userRepo as never,
        { findActiveByUserId: jest.fn() } as never,
        passwordResetRepo as never,
        {
            sendPasswordResetEmail: jest.fn(),
            sendPasswordChangedNotification: jest.fn(),
        } as never,
        { increment: jest.fn() },
        { create: jest.fn().mockResolvedValue(undefined) } as never,
    );

    return { service, userRepo, passwordResetRepo };
}

describe('confirmPasswordReset', () => {
    const user = { snowflakeId: 'user-1' };

    it('burns the token before checking the password, so it cannot be replayed', async () => {
        const { service, userRepo, passwordResetRepo } = makeService({
            userRepo: {
                findById: jest.fn().mockResolvedValue(user),
                comparePassword: jest.fn().mockResolvedValue(true),
            },
            passwordResetRepo: {
                findByHashedToken: jest
                    .fn()
                    .mockResolvedValue({ userId: 'user-1' }),
            },
        });

        await expect(
            service.confirmPasswordReset('a'.repeat(64), 'CandidateP@ss1'),
        ).rejects.toThrow(ErrorMessages.AUTH.NEW_PASSWORD_SAME);

        expect(passwordResetRepo.markAsUsed).toHaveBeenCalledTimes(1);
        const markedAt = passwordResetRepo.markAsUsed.mock
            .invocationCallOrder[0] as number;
        const comparedAt = userRepo.comparePassword.mock
            .invocationCallOrder[0] as number;
        expect(markedAt).toBeLessThan(comparedAt);
    });

    it('reports password reuse distinctly from an invalid token', async () => {
        const { service } = makeService({
            userRepo: {
                findById: jest.fn().mockResolvedValue(user),
                comparePassword: jest.fn().mockResolvedValue(true),
            },
            passwordResetRepo: {
                findByHashedToken: jest
                    .fn()
                    .mockResolvedValue({ userId: 'user-1' }),
            },
        });

        await expect(
            service.confirmPasswordReset('a'.repeat(64), 'CandidateP@ss1'),
        ).rejects.toThrow(ErrorMessages.AUTH.NEW_PASSWORD_SAME);
    });

    it('still rejects an already-used token as an invalid token', async () => {
        const { service } = makeService({
            userRepo: { findById: jest.fn().mockResolvedValue(user) },
            passwordResetRepo: {
                findByHashedToken: jest
                    .fn()
                    .mockResolvedValue({ userId: 'user-1' }),
                markAsUsed: jest.fn().mockResolvedValue(false),
            },
        });

        await expect(
            service.confirmPasswordReset('a'.repeat(64), 'NewP@ssw0rd1'),
        ).rejects.toThrow(ErrorMessages.AUTH.INVALID_RESET_TOKEN);
    });

    it('completes a genuine reset', async () => {
        const { service, userRepo } = makeService({
            userRepo: {
                findById: jest.fn().mockResolvedValue(user),
                comparePassword: jest.fn().mockResolvedValue(false),
            },
            passwordResetRepo: {
                findByHashedToken: jest
                    .fn()
                    .mockResolvedValue({ userId: 'user-1' }),
            },
        });

        await expect(
            service.confirmPasswordReset('a'.repeat(64), 'NewP@ssw0rd1'),
        ).resolves.toMatchObject({ userId: 'user-1' });
        expect(userRepo.updatePassword).toHaveBeenCalled();
    });
});

describe('login timing', () => {
    async function time(fn: () => Promise<unknown>): Promise<number> {
        const start = process.hrtime.bigint();
        await fn();
        return Number(process.hrtime.bigint() - start) / 1e6;
    }

    it('spends comparable work whether or not the login exists', async () => {
        const realHash = await import('bcrypt').then((b) =>
            b.hash('CorrectHorse1!', 10),
        );

        const missing = makeService({
            userRepo: { findByLogin: jest.fn().mockResolvedValue(null) },
        });
        const present = makeService({
            userRepo: {
                findByLogin: jest.fn().mockResolvedValue({
                    snowflakeId: 'user-1',
                    failedLoginAttempts: 0,
                }),
                comparePassword: jest.fn(
                    async (_id: string, candidate: string) => {
                        const bcrypt = await import('bcrypt');
                        return bcrypt.compare(candidate, realHash);
                    },
                ),
            },
        });

        const missingMs = await time(() =>
            missing.service.login('nobody@example.invalid', 'Guess1!'),
        );
        const presentMs = await time(() =>
            present.service.login('someone@example.invalid', 'Guess1!'),
        );

        expect(missingMs).toBeGreaterThan(presentMs * 0.5);
    }, 20000);
});
