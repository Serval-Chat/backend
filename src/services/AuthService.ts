import { Injectable, Inject } from '@nestjs/common';
import { TYPES } from '@/di/types';
import { ILogger } from '@/di/interfaces/ILogger';
import { IUser, IUserRepository } from '@/di/interfaces/IUserRepository';
import { IBanRepository } from '@/di/interfaces/IBanRepository';
import { IPasswordResetRepository } from '@/di/interfaces/IPasswordResetRepository';
import { IMailService } from '@/di/interfaces/IMailService';
import { IMetricsService } from '@/di/interfaces/IMetricsService';
import { IAuditLogRepository } from '@/di/interfaces/IAuditLogRepository';
import { ErrorMessages } from '@/constants/errorMessages';
import { AUTH_CONSTANTS } from '@/constants/auth';
import { normalizeEmail } from '@/utils/email';
import crypto from 'crypto';
import { FRONTEND_URL } from '@/config/env';
import { ApiError } from '@/utils/ApiError';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/config/env';
import { TotpUsedCode } from '@/models/TotpUsedCode';
import {
    decryptSecret,
    encryptSecret,
    generateBackupCodes,
    generateOtpAuthUri,
    generateTotpSecret,
    hashRecoveryCode,
    normalizeBackupCode,
    verifyTotp,
} from '@/utils/totp';
import { Types } from 'mongoose';
import { isNonEmptyString } from '@/utils/typeGuards';
import type { NonEmptyString } from '@/types/branded';
// Authentication result
export interface AuthResult {
    success: boolean;
    user?: IUser;
    error?: string;
    ban?: {
        reason: string;
        expirationTimestamp?: Date;
    };
}

export interface TempTokenPayload {
    type?: 'access' | '2fa_temp';
    scope?: 'auth:2fa:verify';
    id: string;
    login: string;
    username: string;
    tokenVersion: number;
    iat?: number;
    exp?: number;
}

import { injectable, inject } from 'inversify';

// Authentication Service
//
// Handles user authentication, password validation, and ban checking.
// Uses dependency injection for better testability.
@injectable()
@Injectable()
export class AuthService {
    private readonly issuer = 'Serchat';

    public constructor(
        @inject(TYPES.Logger) @Inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.UserRepository)
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
        @inject(TYPES.BanRepository)
        @Inject(TYPES.BanRepository)
        private banRepo: IBanRepository,
        @inject(TYPES.PasswordResetRepository)
        @Inject(TYPES.PasswordResetRepository)
        private passwordResetRepo: IPasswordResetRepository,
        @inject(TYPES.MailService)
        @Inject(TYPES.MailService)
        private mailService: IMailService,
        @inject(TYPES.MetricsService)
        @Inject(TYPES.MetricsService)
        private metrics: IMetricsService,
        @inject(TYPES.AuditLogRepository)
        @Inject(TYPES.AuditLogRepository)
        private auditLogRepo: IAuditLogRepository,
    ) {}

    // Authenticate a user with login credentials.
    //
    // Flow:
    public async login(login: string, password: string): Promise<AuthResult> {
        // Normalize email to prevent plus-addressing bypass
        const normalizedLogin = normalizeEmail(login);
        this.logger.debug(`Login attempt for: ${normalizedLogin}`);

        const user = await this.userRepo.findByLogin(normalizedLogin);

        if (!user) {
            this.logger.warn(
                `Login failed: User not found - ${normalizedLogin}`,
            );
            return {
                success: false,
                error: ErrorMessages.AUTH.INVALID_CREDENTIALS,
            };
        }

        // Block soft-deleted accounts
        if (user.deletedAt) {
            this.logger.warn(
                `Login failed: Account deleted - ${normalizedLogin}`,
            );
            return {
                success: false,
                error: ErrorMessages.AUTH.INVALID_CREDENTIALS,
            };
        }

        // Validate password via repository
        const valid = await this.userRepo.comparePassword(user._id, password);
        if (!valid) {
            this.logger.warn(
                `Login failed: Invalid password - ${normalizedLogin}`,
            );
            return {
                success: false,
                error: ErrorMessages.AUTH.INVALID_CREDENTIALS,
            };
        }

        // Check for bans
        await this.banRepo.checkExpired(user._id);
        const activeBan = await this.banRepo.findActiveByUserId(user._id);

        if (activeBan) {
            this.logger.warn(
                `Login failed: Account banned - ${normalizedLogin}`,
            );
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

        this.logger.info(`Login successful: ${normalizedLogin}`);
        return {
            success: true,
            user: user as unknown as IUser,
        };
    }

    public async setupTotp(
        userId: string,
        username: string,
    ): Promise<{ otpauthUri: string }> {
        const oid = new Types.ObjectId(userId);
        const user = await this.userRepo.findById(oid);
        if (!user) throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        if (user.totpEnabled === true) {
            throw new ApiError(400, ErrorMessages.AUTH.TWO_FA_ALREADY_ENABLED);
        }

        const secret = generateTotpSecret();
        const encryptedSecret = encryptSecret(secret);
        await this.userRepo.update(oid, {
            totpSecret: encryptedSecret as NonEmptyString,
            totpEnabled: false,
            totpVerifiedAt: null,
            backupCodes: [],
        });

        return {
            otpauthUri: generateOtpAuthUri(
                secret,
                `${this.issuer}:${username}`,
                this.issuer,
            ),
        };
    }

    public async confirmTotpSetup(
        userId: string,
        code: string,
    ): Promise<{ backupCodes: string[] }> {
        const oid = new Types.ObjectId(userId);
        const user = await this.userRepo.findById(oid);
        if (!user) throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        if (!isNonEmptyString(user.totpSecret)) {
            throw new ApiError(400, ErrorMessages.AUTH.TWO_FA_SETUP_REQUIRED);
        }

        const secret = decryptSecret(user.totpSecret);
        const verification = verifyTotp(secret, code, 1);
        if (!verification.valid) {
            throw new ApiError(400, ErrorMessages.AUTH.INVALID_TOTP_CODE);
        }

        const backupCodes = generateBackupCodes(10);
        await this.userRepo.update(oid, {
            totpEnabled: true,
            totpVerifiedAt: new Date(),
            backupCodes: backupCodes.map(hashRecoveryCode),
            totpVerifyFailures: 0,
            totpLockedUntil: null,
        });

        return { backupCodes };
    }

    public verifyTempToken(tempToken: string): TempTokenPayload {
        try {
            const decoded = jwt.verify(
                tempToken,
                JWT_SECRET,
            ) as TempTokenPayload;
            if (
                decoded.type !== '2fa_temp' ||
                decoded.scope !== 'auth:2fa:verify'
            ) {
                throw new ApiError(401, ErrorMessages.AUTH.INVALID_TEMP_TOKEN);
            }
            return decoded;
        } catch {
            throw new ApiError(401, ErrorMessages.AUTH.INVALID_TEMP_TOKEN);
        }
    }

    public async verifyTwoFactorCode(input: {
        userId: string;
        code?: string;
        backupCode?: string;
        requireEnabled?: boolean;
    }): Promise<void> {
        const oid = new Types.ObjectId(input.userId);
        const user = await this.userRepo.findById(oid);
        if (!user) throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        if (input.requireEnabled === true && user.totpEnabled !== true) {
            throw new ApiError(400, ErrorMessages.AUTH.TWO_FA_NOT_ENABLED);
        }

        const now = new Date();
        if (user.totpLockedUntil && user.totpLockedUntil > now) {
            throw new ApiError(429, ErrorMessages.AUTH.TWO_FA_LOCKED);
        }

        let isValid = false;
        let replayKey = '';
        let replayExpiry = new Date(Date.now() + 120_000);
        let consumeBackupCodeHash: string | null = null;

        if (input.backupCode !== undefined && input.backupCode !== '') {
            const normalized = normalizeBackupCode(input.backupCode);
            const hashed = hashRecoveryCode(normalized);
            if ((user.backupCodes || []).includes(hashed)) {
                isValid = true;
                consumeBackupCodeHash = hashed;
                replayKey = `backup:${hashed}`;
                replayExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
            }
        } else if (input.code !== undefined && input.code !== '') {
            if (!isNonEmptyString(user.totpSecret)) {
                throw new ApiError(
                    400,
                    ErrorMessages.AUTH.TWO_FA_SETUP_REQUIRED,
                );
            }
            const secret = decryptSecret(user.totpSecret);
            const verification = verifyTotp(secret, input.code, 1);
            if (
                verification.valid &&
                typeof verification.counter === 'number'
            ) {
                isValid = true;
                replayKey = `totp:${verification.counter}`;
                replayExpiry = new Date((verification.counter + 2) * 30 * 1000);
            }
        }

        if (!isValid || !replayKey) {
            const failures = (user.totpVerifyFailures ?? 0) + 1;
            const lock =
                failures >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
            await this.userRepo.update(oid, {
                totpVerifyFailures: failures >= 5 ? 0 : failures,
                totpLockedUntil: lock,
            });
            throw new ApiError(400, ErrorMessages.AUTH.INVALID_TOTP_CODE);
        }

        const replayHash = hashRecoveryCode(replayKey);
        const existing = await TotpUsedCode.findOne({
            userId: oid,
            code: replayHash,
            expiresAt: { $gt: now },
        })
            .lean()
            .exec();
        if (existing) {
            throw new ApiError(400, ErrorMessages.AUTH.INVALID_TOTP_CODE);
        }

        try {
            await TotpUsedCode.create({
                userId: oid,
                code: replayHash,
                expiresAt: replayExpiry,
            });
        } catch {
            throw new ApiError(400, ErrorMessages.AUTH.INVALID_TOTP_CODE);
        }

        const updateData: Record<string, unknown> = {
            totpVerifyFailures: 0,
            totpLockedUntil: null,
        };
        if (consumeBackupCodeHash !== null && consumeBackupCodeHash !== '') {
            updateData.backupCodes = (user.backupCodes || []).filter(
                (x) => x !== consumeBackupCodeHash,
            );
        }
        await this.userRepo.update(oid, updateData);
    }

    public async regenerateBackupCodes(
        userId: string,
        code?: string,
    ): Promise<{ backupCodes: string[] }> {
        await this.verifyTwoFactorCode({
            userId,
            code,
            requireEnabled: true,
        });
        const backupCodes = generateBackupCodes(10);
        await this.userRepo.update(new Types.ObjectId(userId), {
            backupCodes: backupCodes.map(hashRecoveryCode),
        });
        return { backupCodes };
    }

    public async disableTwoFactor(
        userId: string,
        code?: string,
        backupCode?: string,
    ): Promise<void> {
        await this.verifyTwoFactorCode({
            userId,
            code,
            backupCode,
            requireEnabled: true,
        });
        await this.userRepo.update(new Types.ObjectId(userId), {
            totpSecret: null,
            totpEnabled: false,
            totpVerifiedAt: null,
            backupCodes: [],
            totpVerifyFailures: 0,
            totpLockedUntil: null,
        });
    }

    // Request a password reset
    public async requestPasswordReset(
        email: string,
        ip: string,
    ): Promise<string> {
        const requestId = crypto.randomBytes(8).toString('hex');

        // Normalize email to prevent plus-addressing bypass
        const normalizedEmail = normalizeEmail(email);

        this.logger.info(
            `[${requestId}] Password reset requested for email: ${normalizedEmail}`,
        );

        const user = await this.userRepo.findByLogin(normalizedEmail);

        if (!user) {
            this.logger.info(
                `[${requestId}] Password reset requested for non-existent user: ${normalizedEmail}`,
            );
            return requestId;
        }

        const windowStart = new Date(
            Date.now() - AUTH_CONSTANTS.RATE_LIMIT.WINDOW_MS,
        );

        // Generate token
        const token = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');
        const expiresAt = new Date(Date.now() + AUTH_CONSTANTS.TOKEN.EXPIRY_MS);

        // Rate limit check and creation using transaction
        const resetRequest = await this.passwordResetRepo.createIfUnderLimit(
            {
                userId: user._id,
                hashedToken,
                expiresAt,
                ipParam: ip,
            },
            {
                maxPerUser: AUTH_CONSTANTS.RATE_LIMIT.MAX_PER_USER,
                maxPerIp: AUTH_CONSTANTS.RATE_LIMIT.MAX_PER_IP,
            },
            windowStart,
        );

        if (!resetRequest) {
            this.logger.warn(
                `[${requestId}] Password reset rate limit exceeded for user: ${user._id} or IP: ${ip}`,
            );
            this.metrics.increment('password_reset.rate_limited');
            return requestId;
        }

        // Send email with token in hash fragment to prevent any leaks in proxies or whatever shit they log
        const resetLink = `${FRONTEND_URL}/reset-password#token=${token}`;

        try {
            await this.mailService.sendPasswordResetEmail(
                email,
                resetLink,
                requestId,
            );
            this.metrics.increment('password_reset.email.success');
        } catch (error) {
            this.logger.error(`[${requestId}] Email failed`, {
                email,
                error,
                requiresManualIntervention: true,
            });
            this.metrics.increment('password_reset.email.failure');
        }

        // Audit log
        await this.auditLogRepo.create({
            actorId: user._id,
            actionType: 'PASSWORD_RESET_REQUESTED',
            targetUserId: user._id,
            additionalData: { ip, requestId },
        });

        return requestId;
    }

    // Confirm password reset
    public async confirmPasswordReset(
        token: string,
        newPassword: string,
    ): Promise<string> {
        const requestId = crypto.randomBytes(8).toString('hex');
        const hashedToken = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');

        const resetRequest =
            await this.passwordResetRepo.findByHashedToken(hashedToken);
        if (!resetRequest) {
            this.logger.warn(
                `[${requestId}] Failed password reset attempt with invalid token`,
            );
            throw new ApiError(400, ErrorMessages.AUTH.INVALID_RESET_TOKEN);
        }

        const user = await this.userRepo.findById(resetRequest.userId);
        if (!user) {
            this.logger.warn(
                `[${requestId}] Failed password reset: User not found`,
            );
            throw new ApiError(400, ErrorMessages.AUTH.INVALID_RESET_TOKEN);
        }

        // Prevent password reuse
        const isSamePassword = await this.userRepo.comparePassword(
            user._id,
            newPassword,
        );
        if (isSamePassword) {
            throw new ApiError(400, ErrorMessages.AUTH.INVALID_RESET_TOKEN);
        }

        const marked = await this.passwordResetRepo.markAsUsed(hashedToken);
        if (!marked) {
            this.logger.warn(
                `[${requestId}] Failed password reset: Token already used`,
            );
            throw new ApiError(400, ErrorMessages.AUTH.INVALID_RESET_TOKEN);
        }

        this.logger.info(
            `[${requestId}] Password reset confirmed for user: ${resetRequest.userId}`,
        );

        // Update password
        await this.userRepo.updatePassword(resetRequest.userId, newPassword);

        // Invalidate sessions
        await this.userRepo.incrementTokenVersion(resetRequest.userId);

        // Invalidate all other reset tokens for this user
        await this.passwordResetRepo.deleteByUser(resetRequest.userId);

        // Send confirmation email
        if (user.login !== undefined && user.login !== '') {
            try {
                await this.mailService.sendPasswordChangedNotification(
                    user.login,
                );
            } catch (error) {
                this.logger.error(
                    `[${requestId}] Failed to send password change notification to ${user.login}`,
                    error,
                );
            }
        }

        // Audit log (actorId represents the admin or regular user)
        await this.auditLogRepo.create({
            actorId: resetRequest.userId,
            actionType: 'PASSWORD_RESET_COMPLETED',
            targetUserId: resetRequest.userId,
        });

        return requestId;
    }
}
