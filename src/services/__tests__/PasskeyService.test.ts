import { ErrorMessages } from '@/constants/errorMessages';
import { AUTH_CONSTANTS } from '@/constants/auth';
import { PasskeyService } from '../PasskeyService';

const generateRegistrationOptions = jest.fn();
const verifyRegistrationResponse = jest.fn();
const generateAuthenticationOptions = jest.fn();
const verifyAuthenticationResponse = jest.fn();

jest.mock('@simplewebauthn/server', () => ({
    generateRegistrationOptions: (...args: unknown[]) =>
        generateRegistrationOptions(...args),
    verifyRegistrationResponse: (...args: unknown[]) =>
        verifyRegistrationResponse(...args),
    generateAuthenticationOptions: (...args: unknown[]) =>
        generateAuthenticationOptions(...args),
    verifyAuthenticationResponse: (...args: unknown[]) =>
        verifyAuthenticationResponse(...args),
}));

const logger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
};

const mockRedisClient = {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
};

function makeService(
    overrides: {
        passkeyRepo?: Record<string, jest.Mock>;
        userRepo?: Record<string, jest.Mock>;
        banRepo?: Record<string, jest.Mock>;
    } = {},
) {
    const passkeyRepo = {
        create: jest.fn(),
        findByCredentialId: jest.fn(),
        findByUser: jest.fn().mockResolvedValue([]),
        findByIdForUser: jest.fn(),
        rename: jest.fn(),
        updateCounter: jest.fn().mockResolvedValue(undefined),
        deleteByIdForUser: jest.fn(),
        ...overrides.passkeyRepo,
    };
    const userRepo = {
        findById: jest.fn(),
        ...overrides.userRepo,
    };
    const banRepo = {
        checkExpired: jest.fn().mockResolvedValue(undefined),
        findActiveByUserId: jest.fn().mockResolvedValue(null),
        ...overrides.banRepo,
    };
    const redisService = { getClient: () => mockRedisClient };

    const service = new PasskeyService(
        logger,
        passkeyRepo,
        userRepo as never,
        banRepo as never,
        redisService as never,
    );

    return { service, passkeyRepo, userRepo, banRepo };
}

describe('PasskeyService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRedisClient.set.mockResolvedValue('OK');
        mockRedisClient.del.mockResolvedValue(1);
    });

    describe('generateRegistrationOptions', () => {
        it('populates excludeCredentials from the user existing passkeys and stores the challenge', async () => {
            const { service } = makeService({
                passkeyRepo: {
                    findByUser: jest.fn().mockResolvedValue([
                        {
                            credentialId: 'cred-1',
                            transports: ['internal'],
                        },
                    ]),
                },
            });
            generateRegistrationOptions.mockResolvedValue({
                challenge: 'chal-1',
            });

            await service.generateRegistrationOptions(
                'user-1',
                'user@example.com',
                'display',
            );

            expect(generateRegistrationOptions).toHaveBeenCalledWith(
                expect.objectContaining({
                    excludeCredentials: [
                        { id: 'cred-1', transports: ['internal'] },
                    ],
                    authenticatorSelection: {
                        residentKey: 'required',
                        userVerification: 'preferred',
                    },
                }),
            );
            expect(mockRedisClient.set).toHaveBeenCalledWith(
                'webauthn:reg-challenge:user-1',
                'chal-1',
                'EX',
                AUTH_CONSTANTS.PASSKEY.CHALLENGE_TTL_SECONDS,
            );
        });

        it('rejects once the user is at the passkey cap', async () => {
            const existing = new Array(
                AUTH_CONSTANTS.PASSKEY.MAX_PER_USER,
            ).fill({ credentialId: 'x' });
            const { service } = makeService({
                passkeyRepo: {
                    findByUser: jest.fn().mockResolvedValue(existing),
                },
            });

            await expect(
                service.generateRegistrationOptions('user-1', 'login', 'name'),
            ).rejects.toThrow(ErrorMessages.AUTH.PASSKEY_LIMIT_REACHED);
            expect(generateRegistrationOptions).not.toHaveBeenCalled();
        });
    });

    describe('verifyRegistration', () => {
        it('rejects when the registration challenge is missing or expired', async () => {
            const { service } = makeService();
            mockRedisClient.get.mockResolvedValue(null);

            await expect(
                service.verifyRegistration('user-1', {} as never),
            ).rejects.toThrow(ErrorMessages.AUTH.PASSKEY_CHALLENGE_EXPIRED);
            expect(verifyRegistrationResponse).not.toHaveBeenCalled();
        });

        it('persists the credential when verification succeeds', async () => {
            const { service, passkeyRepo } = makeService();
            mockRedisClient.get.mockResolvedValue('chal-1');
            verifyRegistrationResponse.mockResolvedValue({
                verified: true,
                registrationInfo: {
                    credential: {
                        id: 'cred-1',
                        publicKey: new Uint8Array([1, 2, 3]),
                        counter: 0,
                        transports: ['internal'],
                    },
                    credentialDeviceType: 'singleDevice',
                    credentialBackedUp: false,
                    aaguid: 'aaguid-1',
                },
            });
            passkeyRepo.create.mockResolvedValue({
                snowflakeId: 'pk-1',
                name: 'My Passkey',
                deviceType: 'singleDevice',
                transports: ['internal'],
                createdAt: new Date(),
                lastUsedAt: null,
            });

            const result = await service.verifyRegistration(
                'user-1',
                {} as never,
                'My Passkey',
            );

            expect(passkeyRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 'user-1',
                    credentialId: 'cred-1',
                    counter: 0,
                    deviceType: 'singleDevice',
                    backedUp: false,
                    name: 'My Passkey',
                }),
            );
            expect(result.id).toBe('pk-1');
            expect(mockRedisClient.del).toHaveBeenCalledWith(
                'webauthn:reg-challenge:user-1',
            );
        });

        it('rejects when verification reports unverified', async () => {
            const { service, passkeyRepo } = makeService();
            mockRedisClient.get.mockResolvedValue('chal-1');
            verifyRegistrationResponse.mockResolvedValue({ verified: false });

            await expect(
                service.verifyRegistration('user-1', {} as never),
            ).rejects.toThrow(ErrorMessages.AUTH.INVALID_CREDENTIALS);
            expect(passkeyRepo.create).not.toHaveBeenCalled();
        });
    });

    describe('generateAuthenticationOptions', () => {
        it('omits allowCredentials and mints a fresh flowId each call', async () => {
            const { service } = makeService();
            generateAuthenticationOptions.mockResolvedValue({
                challenge: 'chal-2',
            });

            const first = await service.generateAuthenticationOptions();
            const second = await service.generateAuthenticationOptions();

            expect(generateAuthenticationOptions).toHaveBeenCalledWith(
                expect.not.objectContaining({
                    allowCredentials: expect.anything(),
                }),
            );
            expect(first.flowId).not.toBe(second.flowId);
        });
    });

    describe('verifyAuthentication', () => {
        it('rejects when the login challenge is missing or expired', async () => {
            const { service } = makeService();
            mockRedisClient.get.mockResolvedValue(null);

            const result = await service.verifyAuthentication(
                'flow-1',
                {} as never,
            );

            expect(result).toEqual({
                success: false,
                error: ErrorMessages.AUTH.PASSKEY_CHALLENGE_EXPIRED,
            });
        });

        it('returns a generic invalid-credentials failure for an unknown credential id', async () => {
            const { service, passkeyRepo } = makeService({
                passkeyRepo: {
                    findByCredentialId: jest.fn().mockResolvedValue(null),
                },
            });
            mockRedisClient.get.mockResolvedValue('chal-1');

            const result = await service.verifyAuthentication('flow-1', {
                id: 'unknown-cred',
            } as never);

            expect(result).toEqual({
                success: false,
                error: ErrorMessages.AUTH.INVALID_CREDENTIALS,
            });
            expect(passkeyRepo.findByCredentialId).toHaveBeenCalledWith(
                'unknown-cred',
            );
        });

        it('rejects a soft-deleted owner', async () => {
            const { service } = makeService({
                passkeyRepo: {
                    findByCredentialId: jest.fn().mockResolvedValue({
                        userId: 'user-1',
                        credentialId: 'cred-1',
                        publicKey: Buffer.from('pk'),
                        counter: 0,
                    }),
                },
                userRepo: {
                    findById: jest.fn().mockResolvedValue({
                        snowflakeId: 'user-1',
                        deletedAt: new Date(),
                    }),
                },
            });
            mockRedisClient.get.mockResolvedValue('chal-1');

            const result = await service.verifyAuthentication('flow-1', {
                id: 'cred-1',
            } as never);

            expect(result).toEqual({
                success: false,
                error: ErrorMessages.AUTH.INVALID_CREDENTIALS,
            });
        });

        it('returns the ban shape for a banned owner without attempting WebAuthn verification', async () => {
            const { service } = makeService({
                passkeyRepo: {
                    findByCredentialId: jest.fn().mockResolvedValue({
                        userId: 'user-1',
                        credentialId: 'cred-1',
                        publicKey: Buffer.from('pk'),
                        counter: 0,
                    }),
                },
                userRepo: {
                    findById: jest
                        .fn()
                        .mockResolvedValue({ snowflakeId: 'user-1' }),
                },
                banRepo: {
                    findActiveByUserId: jest
                        .fn()
                        .mockResolvedValue({ reason: 'spam' }),
                },
            });
            mockRedisClient.get.mockResolvedValue('chal-1');

            const result = await service.verifyAuthentication('flow-1', {
                id: 'cred-1',
            } as never);

            expect(result).toEqual({
                success: false,
                error: ErrorMessages.AUTH.ACCOUNT_BANNED,
                ban: { reason: 'spam' },
            });
            expect(verifyAuthenticationResponse).not.toHaveBeenCalled();
        });

        it('rejects when the assertion is not verified (covers a counter/clone rejection)', async () => {
            const { service, passkeyRepo } = makeService({
                passkeyRepo: {
                    findByCredentialId: jest.fn().mockResolvedValue({
                        userId: 'user-1',
                        credentialId: 'cred-1',
                        publicKey: Buffer.from('pk'),
                        counter: 5,
                    }),
                },
                userRepo: {
                    findById: jest
                        .fn()
                        .mockResolvedValue({ snowflakeId: 'user-1' }),
                },
            });
            mockRedisClient.get.mockResolvedValue('chal-1');
            verifyAuthenticationResponse.mockResolvedValue({
                verified: false,
            });

            const result = await service.verifyAuthentication('flow-1', {
                id: 'cred-1',
            } as never);

            expect(result.success).toBe(false);
            expect(passkeyRepo.updateCounter).not.toHaveBeenCalled();
        });

        it('persists the new counter and returns the user on success', async () => {
            const { service, passkeyRepo } = makeService({
                passkeyRepo: {
                    findByCredentialId: jest.fn().mockResolvedValue({
                        userId: 'user-1',
                        credentialId: 'cred-1',
                        publicKey: Buffer.from('pk'),
                        counter: 5,
                    }),
                },
                userRepo: {
                    findById: jest
                        .fn()
                        .mockResolvedValue({ snowflakeId: 'user-1' }),
                },
            });
            mockRedisClient.get.mockResolvedValue('chal-1');
            verifyAuthenticationResponse.mockResolvedValue({
                verified: true,
                authenticationInfo: { newCounter: 6 },
            });

            const result = await service.verifyAuthentication('flow-1', {
                id: 'cred-1',
            } as never);

            expect(result.success).toBe(true);
            expect(result.user?.snowflakeId).toBe('user-1');
            expect(passkeyRepo.updateCounter).toHaveBeenCalledWith(
                'cred-1',
                6,
                expect.any(Date),
            );
        });

        it('accepts a matching expectedUserId (step-up re-auth use case)', async () => {
            const { service } = makeService({
                passkeyRepo: {
                    findByCredentialId: jest.fn().mockResolvedValue({
                        userId: 'user-1',
                        credentialId: 'cred-1',
                        publicKey: Buffer.from('pk'),
                        counter: 5,
                    }),
                },
                userRepo: {
                    findById: jest
                        .fn()
                        .mockResolvedValue({ snowflakeId: 'user-1' }),
                },
            });
            mockRedisClient.get.mockResolvedValue('chal-1');
            verifyAuthenticationResponse.mockResolvedValue({
                verified: true,
                authenticationInfo: { newCounter: 6 },
            });

            const result = await service.verifyAuthentication(
                'flow-1',
                { id: 'cred-1' } as never,
                'user-1',
            );

            expect(result.success).toBe(true);
        });

        it('rejects when expectedUserId does not match the credential owner, without attempting WebAuthn verification', async () => {
            const { service } = makeService({
                passkeyRepo: {
                    findByCredentialId: jest.fn().mockResolvedValue({
                        userId: 'user-1',
                        credentialId: 'cred-1',
                        publicKey: Buffer.from('pk'),
                        counter: 5,
                    }),
                },
                userRepo: {
                    findById: jest
                        .fn()
                        .mockResolvedValue({ snowflakeId: 'user-1' }),
                },
            });
            mockRedisClient.get.mockResolvedValue('chal-1');

            const result = await service.verifyAuthentication(
                'flow-1',
                { id: 'cred-1' } as never,
                'someone-else',
            );

            expect(result).toEqual({
                success: false,
                error: ErrorMessages.AUTH.INVALID_CREDENTIALS,
            });
            expect(verifyAuthenticationResponse).not.toHaveBeenCalled();
        });
    });
});
