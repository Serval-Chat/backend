import { Injectable, Inject } from '@nestjs/common';
import { TYPES } from '@/di/types';
import { ILogger } from '@/di/interfaces/ILogger';
import { IUserRepository } from '@/di/interfaces/IUserRepository';
import { IBanRepository } from '@/di/interfaces/IBanRepository';
import { ErrorMessages } from '@/constants/errorMessages';
import { type IUser } from '@/di/interfaces/IUserRepository';

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
        const valid = await this.userRepo.comparePassword(
            user._id.toString(),
            password,
        );
        if (!valid) {
            this.logger.warn(`Login failed: Invalid password - ${login}`);
            return {
                success: false,
                error: ErrorMessages.AUTH.INVALID_CREDENTIALS,
            };
        }

        // Check for bans
        await this.banRepo.checkExpired(user._id.toString());
        const activeBan = await this.banRepo.findActiveByUserId(
            user._id.toString(),
        );

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
            user,
        };
    }
}
