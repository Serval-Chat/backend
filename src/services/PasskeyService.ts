import { Inject } from '@nestjs/common';
import { inject, injectable } from 'inversify';
import crypto from 'crypto';
import {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
    AuthenticatorTransportFuture,
    RegistrationResponseJSON,
    AuthenticationResponseJSON,
    PublicKeyCredentialCreationOptionsJSON,
    PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';
import { TYPES } from '@/di/types';
import { ILogger } from '@/di/interfaces/ILogger';
import { IPasskeyCredentialRepository } from '@/di/interfaces/IPasskeyCredentialRepository';
import { IUser, IUserRepository } from '@/di/interfaces/IUserRepository';
import { IBanRepository } from '@/di/interfaces/IBanRepository';
import { IRedisService } from '@/di/interfaces/IRedisService';
import { ErrorMessages } from '@/constants/errorMessages';
import { AUTH_CONSTANTS } from '@/constants/auth';
import { ApiError } from '@/utils/ApiError';
import {
    WEBAUTHN_RP_ID,
    WEBAUTHN_RP_NAME,
    WEBAUTHN_ORIGIN,
} from '@/config/env';
import type { IPasskeyCredential } from '@/models/PasskeyCredential';

export interface PasskeyCredentialSummary {
    id: string;
    name: string;
    deviceType: 'singleDevice' | 'multiDevice';
    transports?: string[];
    createdAt: Date;
    lastUsedAt: Date | null;
}

export interface PasskeyAuthResult {
    success: boolean;
    user?: IUser;
    error?: string;
    ban?: {
        reason: string;
        expirationTimestamp?: Date;
    };
}

@injectable()
export class PasskeyService {
    public constructor(
        @inject(TYPES.Logger) @Inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.PasskeyCredentialRepository)
        @Inject(TYPES.PasskeyCredentialRepository)
        private passkeyRepo: IPasskeyCredentialRepository,
        @inject(TYPES.UserRepository)
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
        @inject(TYPES.BanRepository)
        @Inject(TYPES.BanRepository)
        private banRepo: IBanRepository,
        @inject(TYPES.RedisService)
        @Inject(TYPES.RedisService)
        private redisService: IRedisService,
    ) {}

    private toSummary(
        credential: IPasskeyCredential,
    ): PasskeyCredentialSummary {
        return {
            id: credential.snowflakeId,
            name: credential.name,
            deviceType: credential.deviceType,
            transports: credential.transports,
            createdAt: credential.createdAt,
            lastUsedAt: credential.lastUsedAt,
        };
    }

    public async listCredentials(
        userId: string,
    ): Promise<PasskeyCredentialSummary[]> {
        const credentials = await this.passkeyRepo.findByUser(userId);
        return credentials.map((c) => this.toSummary(c));
    }

    public async renameCredential(
        userId: string,
        id: string,
        name: string,
    ): Promise<PasskeyCredentialSummary> {
        const updated = await this.passkeyRepo.rename(id, userId, name.trim());
        if (updated === null) {
            throw new ApiError(404, ErrorMessages.AUTH.PASSKEY_NOT_FOUND);
        }
        return this.toSummary(updated);
    }

    public async removeCredential(userId: string, id: string): Promise<void> {
        const deleted = await this.passkeyRepo.deleteByIdForUser(id, userId);
        if (deleted === null) {
            throw new ApiError(404, ErrorMessages.AUTH.PASSKEY_NOT_FOUND);
        }
    }

    private regChallengeKey(userId: string): string {
        return `webauthn:reg-challenge:${userId}`;
    }

    private loginChallengeKey(flowId: string): string {
        return `webauthn:login-challenge:${flowId}`;
    }

    private async storeChallenge(
        key: string,
        challenge: string,
    ): Promise<void> {
        await this.redisService
            .getClient()
            .set(
                key,
                challenge,
                'EX',
                AUTH_CONSTANTS.PASSKEY.CHALLENGE_TTL_SECONDS,
            );
    }

    private async takeChallenge(key: string): Promise<string | null> {
        const client = this.redisService.getClient();
        const value = await client.get(key);
        if (value === null) return null;
        await client.del(key);
        return value;
    }

    public async generateRegistrationOptions(
        userId: string,
        login: string,
        displayName: string,
    ): Promise<PublicKeyCredentialCreationOptionsJSON> {
        const existing = await this.passkeyRepo.findByUser(userId);
        if (existing.length >= AUTH_CONSTANTS.PASSKEY.MAX_PER_USER) {
            throw new ApiError(400, ErrorMessages.AUTH.PASSKEY_LIMIT_REACHED);
        }

        const options = await generateRegistrationOptions({
            rpName: WEBAUTHN_RP_NAME,
            rpID: WEBAUTHN_RP_ID,
            userID: Buffer.from(userId, 'utf8'),
            userName: login,
            userDisplayName: displayName,
            attestationType: 'none',
            excludeCredentials: existing.map((c) => ({
                id: c.credentialId,
                transports: c.transports as
                    AuthenticatorTransportFuture[] | undefined,
            })),
            authenticatorSelection: {
                residentKey: 'required',
                userVerification: 'preferred',
            },
        });

        await this.storeChallenge(
            this.regChallengeKey(userId),
            options.challenge,
        );

        return options;
    }

    public async verifyRegistration(
        userId: string,
        credential: RegistrationResponseJSON,
        name?: string,
    ): Promise<PasskeyCredentialSummary> {
        const expectedChallenge = await this.takeChallenge(
            this.regChallengeKey(userId),
        );
        if (expectedChallenge === null) {
            throw new ApiError(
                400,
                ErrorMessages.AUTH.PASSKEY_CHALLENGE_EXPIRED,
            );
        }

        let verification;
        try {
            verification = await verifyRegistrationResponse({
                response: credential,
                expectedChallenge,
                expectedOrigin: WEBAUTHN_ORIGIN,
                expectedRPID: WEBAUTHN_RP_ID,
                requireUserVerification: true,
            });
        } catch (err) {
            this.logger.error(
                '[PasskeyService] Registration verification threw',
                err,
            );
            throw new ApiError(400, ErrorMessages.AUTH.INVALID_CREDENTIALS);
        }

        if (!verification.verified) {
            throw new ApiError(400, ErrorMessages.AUTH.INVALID_CREDENTIALS);
        }

        const { registrationInfo } = verification;
        const trimmedName = name?.trim();
        const created = await this.passkeyRepo.create({
            userId,
            credentialId: registrationInfo.credential.id,
            publicKey: Buffer.from(registrationInfo.credential.publicKey),
            counter: registrationInfo.credential.counter,
            transports: registrationInfo.credential.transports,
            deviceType: registrationInfo.credentialDeviceType,
            backedUp: registrationInfo.credentialBackedUp,
            aaguid: registrationInfo.aaguid,
            name:
                trimmedName !== undefined && trimmedName !== ''
                    ? trimmedName
                    : 'Passkey',
        });

        return this.toSummary(created);
    }

    public async generateAuthenticationOptions(): Promise<{
        flowId: string;
        options: PublicKeyCredentialRequestOptionsJSON;
    }> {
        const options = await generateAuthenticationOptions({
            rpID: WEBAUTHN_RP_ID,
            userVerification: 'preferred',
        });

        const flowId = crypto.randomBytes(16).toString('hex');
        await this.storeChallenge(
            this.loginChallengeKey(flowId),
            options.challenge,
        );

        return { flowId, options };
    }

    public async verifyAuthentication(
        flowId: string,
        credential: AuthenticationResponseJSON,
        expectedUserId?: string,
    ): Promise<PasskeyAuthResult> {
        const expectedChallenge = await this.takeChallenge(
            this.loginChallengeKey(flowId),
        );
        if (expectedChallenge === null) {
            return {
                success: false,
                error: ErrorMessages.AUTH.PASSKEY_CHALLENGE_EXPIRED,
            };
        }

        const stored = await this.passkeyRepo.findByCredentialId(credential.id);
        if (stored === null) {
            return {
                success: false,
                error: ErrorMessages.AUTH.INVALID_CREDENTIALS,
            };
        }

        const user = await this.userRepo.findById(stored.userId);
        if (user === null || user.deletedAt !== undefined) {
            return {
                success: false,
                error: ErrorMessages.AUTH.INVALID_CREDENTIALS,
            };
        }

        if (
            expectedUserId !== undefined &&
            user.snowflakeId !== expectedUserId
        ) {
            return {
                success: false,
                error: ErrorMessages.AUTH.INVALID_CREDENTIALS,
            };
        }

        await this.banRepo.checkExpired(user.snowflakeId);
        const activeBan = await this.banRepo.findActiveByUserId(
            user.snowflakeId,
        );
        if (activeBan) {
            return {
                success: false,
                error: ErrorMessages.AUTH.ACCOUNT_BANNED,
                ban: {
                    reason: activeBan.reason,
                    ...(activeBan.expirationTimestamp !== undefined && {
                        expirationTimestamp: activeBan.expirationTimestamp,
                    }),
                },
            };
        }

        let verification;
        try {
            verification = await verifyAuthenticationResponse({
                response: credential,
                expectedChallenge,
                expectedOrigin: WEBAUTHN_ORIGIN,
                expectedRPID: WEBAUTHN_RP_ID,
                credential: {
                    id: stored.credentialId,
                    publicKey: new Uint8Array(stored.publicKey),
                    counter: stored.counter,
                    transports: stored.transports as
                        AuthenticatorTransportFuture[] | undefined,
                },
                requireUserVerification: true,
            });
        } catch (err) {
            this.logger.error(
                '[PasskeyService] Authentication verification threw',
                err,
            );
            return {
                success: false,
                error: ErrorMessages.AUTH.INVALID_CREDENTIALS,
            };
        }

        if (!verification.verified) {
            return {
                success: false,
                error: ErrorMessages.AUTH.INVALID_CREDENTIALS,
            };
        }

        await this.passkeyRepo.updateCounter(
            stored.credentialId,
            verification.authenticationInfo.newCounter,
            new Date(),
        );

        return { success: true, user };
    }
}
