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
import crypto from 'crypto';
import { FRONTEND_URL } from '@/config/env';
import { ApiError } from '@/utils/ApiError';

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

import { injectable, inject } from 'inversify';

// Authentication Service
//
// Handles user authentication, password validation, and ban checking.
// Uses dependency injection for better testability.
@injectable()
@Injectable()
export class AuthService {
    constructor(
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
    ) { }

    // Authenticate a user with login credentials.
    //
    // Flow:
    // 1. Find user by login
    // 2. Verify password hash
    // 3. Check if user is soft-deleted (restore if so)
    // 4. Check for active bans
    // 5. Generate JWT and return auth result
    async login(login: string, password: string): Promise<AuthResult> {
        this.logger.debug(`Login attempt for: ${login}`);

        // Find user via repository
        const user = await this.userRepo.findByLogin(login);

        if (!user) {
            this.logger.warn(`Login failed: User not found - ${login}`);
            return {
                success: false,
                error: ErrorMessages.AUTH.INVALID_CREDENTIALS,
            };
        }

        // Block soft-deleted accounts
        if (user.deletedAt) {
            this.logger.warn(`Login failed: Account deleted - ${login}`);
            return {
                success: false,
                error: ErrorMessages.AUTH.INVALID_CREDENTIALS,
            };
        }

        // Validate password via repository
        const valid = await this.userRepo.comparePassword(user._id, password);
        if (!valid) {
            this.logger.warn(`Login failed: Invalid password - ${login}`);
            return {
                success: false,
                error: ErrorMessages.AUTH.INVALID_CREDENTIALS,
            };
        }

        // Check for bans
        await this.banRepo.checkExpired(user._id);
        const activeBan = await this.banRepo.findActiveByUserId(user._id);

        if (activeBan) {
            this.logger.warn(`Login failed: Account banned - ${login}`);
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

        this.logger.info(`Login successful: ${login}`);
        return {
            success: true,
            user: user as unknown as IUser,
        };
    }

    // Request a password reset
    async requestPasswordReset(email: string, ip: string): Promise<string> {
        const requestId = crypto.randomBytes(8).toString('hex');
        this.logger.info(
            `[${requestId}] Password reset requested for email: ${email}`,
        );

        const user = await this.userRepo.findByLogin(email);

        if (!user) {
            this.logger.info(
                `[${requestId}] Password reset requested for non-existent user: ${email}`,
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
    async confirmPasswordReset(
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
        if (user.login) {
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
