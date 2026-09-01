import { ErrorMessages } from '@/constants/errorMessages';
import { hashRecoveryCode, normalizeBackupCode } from '@/utils/totp';
import { PasswordlessService } from '../PasswordlessService';

const logger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
};

function makeService(
    overrides: {
        userRepo?: Record<string, jest.Mock>;
        passkeyRepo?: Record<string, jest.Mock>;
        passkeyService?: Record<string, jest.Mock>;
        banRepo?: Record<string, jest.Mock>;
        auditLogRepo?: Record<string, jest.Mock>;
    } = {},
) {
    const userRepo = {
        findById: jest.fn(),
        findByLogin: jest.fn(),
        comparePassword: jest.fn(),
        enablePasswordless: jest.fn().mockResolvedValue(undefined),
        disablePasswordless: jest.fn().mockResolvedValue(undefined),
        consumeRecoveryKey: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
        ...overrides.userRepo,
    };
    const passkeyRepo = {
        findByUser: jest.fn().mockResolvedValue([]),
        ...overrides.passkeyRepo,
    };
    const passkeyService = {
        generateAuthenticationOptions: jest.fn(),
        verifyAuthentication: jest.fn(),
        ...overrides.passkeyService,
    };
    const banRepo = {
        checkExpired: jest.fn().mockResolvedValue(undefined),
        findActiveByUserId: jest.fn().mockResolvedValue(null),
        ...overrides.banRepo,
    };
    const auditLogRepo = {
        create: jest.fn().mockResolvedValue(undefined),
        ...overrides.auditLogRepo,
    };

    const service = new PasswordlessService(
        logger,
        userRepo as never,
        passkeyRepo as never,
        passkeyService as never,
        banRepo as never,
        auditLogRepo as never,
    );

    return {
        service,
        userRepo,
        passkeyRepo,
        passkeyService,
        banRepo,
        auditLogRepo,
    };
}

describe('PasswordlessService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('enable', () => {
        it('rejects when the user does not exist', async () => {
            const { service } = makeService({
                userRepo: { findById: jest.fn().mockResolvedValue(null) },
            });

            await expect(service.enable('user-1', 'pw')).rejects.toThrow(
                ErrorMessages.AUTH.USER_NOT_FOUND,
            );
        });

        it('rejects when the account is already passwordless', async () => {
            const { service } = makeService({
                userRepo: {
                    findById: jest
                        .fn()
                        .mockResolvedValue({ passwordless: true }),
                },
            });

            await expect(service.enable('user-1', 'pw')).rejects.toThrow(
                ErrorMessages.AUTH.PASSWORDLESS_ALREADY_ENABLED,
            );
        });

        it('rejects on an invalid current password with a 400, never a 401 (a 401 would globally log the user out via the frontend axios interceptor)', async () => {
            const { service } = makeService({
                userRepo: {
                    findById: jest
                        .fn()
                        .mockResolvedValue({ passwordless: false }),
                    comparePassword: jest.fn().mockResolvedValue(false),
                },
            });

            await expect(
                service.enable('user-1', 'wrong-pw'),
            ).rejects.toMatchObject({
                status: 400,
                message: ErrorMessages.AUTH.INVALID_CURRENT_PASSWORD,
            });
        });

        it('rejects when the user has no passkeys registered', async () => {
            const { service } = makeService({
                userRepo: {
                    findById: jest
                        .fn()
                        .mockResolvedValue({ passwordless: false }),
                    comparePassword: jest.fn().mockResolvedValue(true),
                },
                passkeyRepo: { findByUser: jest.fn().mockResolvedValue([]) },
            });

            await expect(service.enable('user-1', 'pw')).rejects.toThrow(
                ErrorMessages.AUTH.PASSWORDLESS_REQUIRES_PASSKEY,
            );
        });

        it('generates 10 recovery keys and persists their hashes', async () => {
            const { service, userRepo } = makeService({
                userRepo: {
                    findById: jest
                        .fn()
                        .mockResolvedValue({ passwordless: false }),
                    comparePassword: jest.fn().mockResolvedValue(true),
                },
                passkeyRepo: {
                    findByUser: jest
                        .fn()
                        .mockResolvedValue([{ credentialId: 'cred-1' }]),
                },
            });

            const recoveryKeys = await service.enable('user-1', 'pw');

            expect(recoveryKeys).toHaveLength(10);
            expect(userRepo.enablePasswordless).toHaveBeenCalledWith(
                'user-1',
                recoveryKeys.map(hashRecoveryCode),
            );
        });
    });

    describe('regenerateRecoveryKeysOptions', () => {
        it('delegates directly to PasskeyService', async () => {
            const { service, passkeyService } = makeService({
                passkeyService: {
                    generateAuthenticationOptions: jest.fn().mockResolvedValue({
                        flowId: 'flow-1',
                        options: { challenge: 'c' },
                    }),
                },
            });

            const result = await service.regenerateRecoveryKeysOptions();

            expect(
                passkeyService.generateAuthenticationOptions,
            ).toHaveBeenCalled();
            expect(result).toEqual({
                flowId: 'flow-1',
                options: { challenge: 'c' },
            });
        });
    });

    describe('regenerateRecoveryKeysVerify', () => {
        it('rejects a failed passkey step-up with a 400, never a 401 (a 401 would globally log the user out via the frontend axios interceptor)', async () => {
            const { service } = makeService({
                passkeyService: {
                    verifyAuthentication: jest
                        .fn()
                        .mockResolvedValue({ success: false }),
                },
            });

            await expect(
                service.regenerateRecoveryKeysVerify(
                    'user-1',
                    'flow-1',
                    {} as never,
                ),
            ).rejects.toMatchObject({
                status: 400,
                message: ErrorMessages.AUTH.INVALID_CREDENTIALS,
            });
        });

        it('passes userId through as expectedUserId and persists new hashed keys on success', async () => {
            const { service, userRepo, passkeyService } = makeService({
                passkeyService: {
                    verifyAuthentication: jest
                        .fn()
                        .mockResolvedValue({ success: true }),
                },
            });

            const recoveryKeys = await service.regenerateRecoveryKeysVerify(
                'user-1',
                'flow-1',
                { id: 'cred-1' } as never,
            );

            expect(passkeyService.verifyAuthentication).toHaveBeenCalledWith(
                'flow-1',
                { id: 'cred-1' },
                'user-1',
            );
            expect(recoveryKeys).toHaveLength(10);
            expect(userRepo.update).toHaveBeenCalledWith('user-1', {
                recoveryKeys: recoveryKeys.map(hashRecoveryCode),
            });
        });
    });

    describe('loginWithRecoveryKey', () => {
        it('returns a generic invalid-credentials failure for an unknown login', async () => {
            const { service, userRepo } = makeService({
                userRepo: { findByLogin: jest.fn().mockResolvedValue(null) },
            });

            const result = await service.loginWithRecoveryKey(
                'nobody@example.com',
                'ABCD-1234',
            );

            expect(result).toEqual({
                success: false,
                error: ErrorMessages.AUTH.INVALID_CREDENTIALS,
            });
            expect(userRepo.consumeRecoveryKey).not.toHaveBeenCalled();
        });

        it('rejects an account that is not passwordless, without attempting to consume a key', async () => {
            const { service, userRepo } = makeService({
                userRepo: {
                    findByLogin: jest.fn().mockResolvedValue({
                        snowflakeId: 'user-1',
                        passwordless: false,
                    }),
                },
            });

            const result = await service.loginWithRecoveryKey(
                'user@example.com',
                'ABCD-1234',
            );

            expect(result.success).toBe(false);
            expect(userRepo.consumeRecoveryKey).not.toHaveBeenCalled();
        });

        it('rejects a non-matching or already-used recovery key', async () => {
            const { service, userRepo } = makeService({
                userRepo: {
                    findByLogin: jest.fn().mockResolvedValue({
                        snowflakeId: 'user-1',
                        passwordless: true,
                    }),
                    consumeRecoveryKey: jest.fn().mockResolvedValue(false),
                },
            });

            const result = await service.loginWithRecoveryKey(
                'user@example.com',
                'WRONG-CODE',
            );

            expect(result).toEqual({
                success: false,
                error: ErrorMessages.AUTH.INVALID_CREDENTIALS,
            });
            expect(userRepo.consumeRecoveryKey).toHaveBeenCalledWith(
                'user-1',
                hashRecoveryCode(normalizeBackupCode('WRONG-CODE')),
            );
        });

        it('returns the ban shape for a banned owner (the key is still consumed atomically before the ban check runs)', async () => {
            const { service, userRepo } = makeService({
                userRepo: {
                    findByLogin: jest.fn().mockResolvedValue({
                        snowflakeId: 'user-1',
                        passwordless: true,
                    }),
                    consumeRecoveryKey: jest.fn().mockResolvedValue(true),
                },
                banRepo: {
                    findActiveByUserId: jest
                        .fn()
                        .mockResolvedValue({ reason: 'spam' }),
                },
            });

            const result = await service.loginWithRecoveryKey(
                'user@example.com',
                'ABCD-1234',
            );

            expect(result).toEqual({
                success: false,
                error: ErrorMessages.AUTH.ACCOUNT_BANNED,
                ban: { reason: 'spam' },
            });
            expect(userRepo.consumeRecoveryKey).toHaveBeenCalled();
        });

        it('atomically consumes the matching hash and succeeds', async () => {
            const { service, userRepo } = makeService({
                userRepo: {
                    findByLogin: jest.fn().mockResolvedValue({
                        snowflakeId: 'user-1',
                        passwordless: true,
                    }),
                    consumeRecoveryKey: jest.fn().mockResolvedValue(true),
                },
            });

            const result = await service.loginWithRecoveryKey(
                'user@example.com',
                'abcd-1234',
            );

            expect(result.success).toBe(true);
            expect(userRepo.consumeRecoveryKey).toHaveBeenCalledWith(
                'user-1',
                hashRecoveryCode(normalizeBackupCode('abcd-1234')),
            );
        });
    });

    describe('adminReset', () => {
        it('rejects when the target user does not exist', async () => {
            const { service } = makeService({
                userRepo: { findById: jest.fn().mockResolvedValue(null) },
            });

            await expect(
                service.adminReset('admin-1', 'missing-user'),
            ).rejects.toThrow(ErrorMessages.AUTH.USER_NOT_FOUND);
        });

        it('sets a temporary password, disables passwordless, and audit-logs the action', async () => {
            const { service, userRepo, auditLogRepo } = makeService({
                userRepo: {
                    findById: jest
                        .fn()
                        .mockResolvedValue({ snowflakeId: 'user-1' }),
                },
            });

            const temporaryPassword = await service.adminReset(
                'admin-1',
                'user-1',
            );

            expect(typeof temporaryPassword).toBe('string');
            expect(temporaryPassword.length).toBeGreaterThan(0);
            expect(userRepo.disablePasswordless).toHaveBeenCalledWith(
                'user-1',
                temporaryPassword,
            );
            expect(auditLogRepo.create).toHaveBeenCalledWith({
                actorId: 'admin-1',
                actionType: 'PASSWORDLESS_ADMIN_RESET',
                targetUserId: 'user-1',
            });
        });
    });
});
