import { Inject } from '@nestjs/common';
import { inject, injectable } from 'inversify';
import type {
    AuthenticationResponseJSON,
    PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';
import { TYPES } from '@/di/types';
import { ILogger } from '@/di/interfaces/ILogger';
import { IUser, IUserRepository } from '@/di/interfaces/IUserRepository';
import { IPasskeyCredentialRepository } from '@/di/interfaces/IPasskeyCredentialRepository';
import { IBanRepository } from '@/di/interfaces/IBanRepository';
import { IAuditLogRepository } from '@/di/interfaces/IAuditLogRepository';
import { ErrorMessages } from '@/constants/errorMessages';
import { ApiError } from '@/utils/ApiError';
import {
    generateBackupCodes,
    hashRecoveryCode,
    normalizeBackupCode,
} from '@/utils/totp';
import { normalizeEmail } from '@/utils/email';
import { PasskeyService } from '@/services/PasskeyService';

export interface PasswordlessAuthResult {
    success: boolean;
    user?: IUser;
    error?: string;
    ban?: {
        reason: string;
        expirationTimestamp?: Date;
    };
}

const RECOVERY_KEY_COUNT = 10;

@injectable()
export class PasswordlessService {
    public constructor(
        @inject(TYPES.Logger) @Inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.UserRepository)
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
        @inject(TYPES.PasskeyCredentialRepository)
        @Inject(TYPES.PasskeyCredentialRepository)
        private passkeyRepo: IPasskeyCredentialRepository,
        @inject(TYPES.PasskeyService)
        @Inject(TYPES.PasskeyService)
        private passkeyService: PasskeyService,
        @inject(TYPES.BanRepository)
        @Inject(TYPES.BanRepository)
        private banRepo: IBanRepository,
        @inject(TYPES.AuditLogRepository)
        @Inject(TYPES.AuditLogRepository)
        private auditLogRepo: IAuditLogRepository,
    ) {}

    public async enable(
        userId: string,
        currentPassword: string,
    ): Promise<string[]> {
        const user = await this.userRepo.findById(userId);
        if (user === null) {
            throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        }
        if (user.passwordless === true) {
            throw new ApiError(
                400,
                ErrorMessages.AUTH.PASSWORDLESS_ALREADY_ENABLED,
            );
        }

        const passwordValid = await this.userRepo.comparePassword(
            userId,
            currentPassword,
        );
        if (passwordValid !== true) {
            throw new ApiError(
                400,
                ErrorMessages.AUTH.INVALID_CURRENT_PASSWORD,
            );
        }

        const passkeys = await this.passkeyRepo.findByUser(userId);
        if (passkeys.length === 0) {
            throw new ApiError(
                400,
                ErrorMessages.AUTH.PASSWORDLESS_REQUIRES_PASSKEY,
            );
        }

        const recoveryKeys = generateBackupCodes(RECOVERY_KEY_COUNT);
        await this.userRepo.enablePasswordless(
            userId,
            recoveryKeys.map(hashRecoveryCode),
        );

        return recoveryKeys;
    }

    public async regenerateRecoveryKeysOptions(): Promise<{
        flowId: string;
        options: PublicKeyCredentialRequestOptionsJSON;
    }> {
        return this.passkeyService.generateAuthenticationOptions();
    }

    public async regenerateRecoveryKeysVerify(
        userId: string,
        flowId: string,
        credential: AuthenticationResponseJSON,
    ): Promise<string[]> {
        const result = await this.passkeyService.verifyAuthentication(
            flowId,
            credential,
            userId,
        );
        if (result.success !== true) {
            throw new ApiError(400, ErrorMessages.AUTH.INVALID_CREDENTIALS);
        }

        const recoveryKeys = generateBackupCodes(RECOVERY_KEY_COUNT);
        await this.userRepo.update(userId, {
            recoveryKeys: recoveryKeys.map(hashRecoveryCode),
        });

        return recoveryKeys;
    }

    public async loginWithRecoveryKey(
        login: string,
        recoveryKey: string,
    ): Promise<PasswordlessAuthResult> {
        const normalizedLogin = normalizeEmail(login);
        this.logger.debug(`Recovery-key login attempt for: ${normalizedLogin}`);

        const user = await this.userRepo.findByLogin(normalizedLogin);

        if (
            user === null ||
            user.deletedAt !== undefined ||
            user.passwordless !== true
        ) {
            return {
                success: false,
                error: ErrorMessages.AUTH.INVALID_CREDENTIALS,
            };
        }

        const candidateHash = hashRecoveryCode(
            normalizeBackupCode(recoveryKey),
        );
        const consumed = await this.userRepo.consumeRecoveryKey(
            user.snowflakeId,
            candidateHash,
        );
        if (!consumed) {
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

        this.logger.info(`Recovery-key login successful: ${normalizedLogin}`);
        return { success: true, user };
    }

    public async adminReset(
        actorId: string,
        targetUserId: string,
    ): Promise<string> {
        const user = await this.userRepo.findById(targetUserId);
        if (user === null) {
            throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        const temporaryPassword = generateBackupCodes(1)[0] as string;
        await this.userRepo.disablePasswordless(
            targetUserId,
            temporaryPassword,
        );

        await this.auditLogRepo.create({
            actorId,
            actionType: 'PASSWORDLESS_ADMIN_RESET',
            targetUserId,
        });

        return temporaryPassword;
    }
}
