import {
    Controller,
    Post,
    Patch,
    Body,
    Req,
    Res,
    UseGuards,
    Inject,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { TYPES } from '@/di/types';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import { AuthService } from '@/services/AuthService';
import { generateTwoFactorTempToken } from '@/utils/jwt';
import {
    createSession,
    revokeAllSessionsForUser,
    revokeSessionById,
} from '@/utils/sessionAuth';
import { SessionDuration } from '@/models/User';
import {
    loginAttemptsCounter,
    registrationAttemptsCounter,
    usersCreatedCounter,
} from '@/utils/metrics';
import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { extractClientIp } from '@/utils/ip';
import { verifyTurnstile } from '@/utils/turnstile';
import { ErrorMessages } from '@/constants/errorMessages';
import { ApiError } from '@/utils/ApiError';
import { normalizeEmail } from '@/utils/email';
import {
    ApiTags,
    ApiResponse,
    ApiOkResponse,
    ApiSecurity,
} from '@nestjs/swagger';
import { AuthGuard } from '@/modules/auth/auth.module';
import { ILogger } from '@/di/interfaces/ILogger';
import type { AuthenticatedRequest } from '@/middleware/auth';
import {
    LoginResponseDTO,
    RegisterResponseDTO,
    ChangeLoginResponseDTO,
    ChangePasswordResponseDTO,
    PasswordResetResponseDTO,
    Disable2FAResponseDTO,
    LogoutResponseDTO,
} from './dto/auth.response.dto';
import {
    TotpSetupConfirmRequestDTO,
    TotpSetupConfirmResponseDTO,
    TotpSetupResponseDTO,
    TotpSensitiveActionRequestDTO,
    TotpVerifyRequestDTO,
} from './dto/totp.dto';

import {
    LoginRequestDTO,
    RegisterRequestDTO,
    ChangeLoginRequestDTO,
    ChangePasswordRequestDTO,
    PasswordResetRequestDTO,
    PasswordResetConfirmDTO,
} from './dto/auth.request.dto';

import { NoBot } from '@/modules/auth/bot.decorator';
import { Public } from '@/modules/auth/public.decorator';

class Mutex {
    private mutex = Promise.resolve();
    public lock(): Promise<() => void> {
        let begin: (unlock: () => void) => void = () => {};
        this.mutex = this.mutex.then(() => {
            return new Promise(begin);
        });
        return new Promise((res) => {
            begin = res;
        });
    }
}
const registerMutex = new Mutex();

@ApiTags('Authentication')
@Controller('api/v1/auth')
export class AuthController {
    public constructor(
        @Inject(TYPES.Logger) private logger: ILogger,
        @Inject(TYPES.AuthService)
        private authService: AuthService,
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
    ) {}

    private sessionDurationFor(user: {
        settings?: { sessionDuration?: string };
    }): string {
        return user.settings?.sessionDuration ?? SessionDuration.THIRTY_DAYS;
    }

    @Post('login')
    @Public()
    @HttpCode(HttpStatus.OK)
    @ApiResponse({ status: 200, type: LoginResponseDTO })
    @ApiResponse({ status: 401, description: 'Invalid credentials' })
    @ApiResponse({ status: 403, description: 'Account banned' })
    public async login(
        @Body() body: LoginRequestDTO,
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<void> {
        const { login, password, cfTurnstileResponse } = body;

        const isHuman = await verifyTurnstile(
            cfTurnstileResponse,
            extractClientIp(req),
        );
        if (!isHuman) {
            res.status(HttpStatus.BAD_REQUEST).json({
                error: 'Captcha verification failed. Please try again.',
            });
            return;
        }

        const authResult = await this.authService.login(login, password);

        if (authResult.success === false || authResult.user === undefined) {
            loginAttemptsCounter.labels('failure').inc();

            if (authResult.ban) {
                res.status(HttpStatus.FORBIDDEN).json({
                    error: authResult.error,
                    ban: authResult.ban,
                });
                return;
            }

            res.status(HttpStatus.UNAUTHORIZED).json({
                error:
                    authResult.error !== undefined && authResult.error !== ''
                        ? authResult.error
                        : ErrorMessages.AUTH.INVALID_CREDENTIALS,
            });
            return;
        }

        const user = authResult.user;

        loginAttemptsCounter.labels('success').inc();

        if (user.totpEnabled === true) {
            const temp_token = generateTwoFactorTempToken({
                id: user.snowflakeId,
                login: login,
                username: user.username as string,
            });

            res.status(HttpStatus.OK).json({
                temp_token,
                two_factor_required: true,
                username: user.username,
            });
            return;
        }

        const { token } = await createSession(
            user.snowflakeId,
            req.headers['user-agent'] ?? 'unknown',
            extractClientIp(req),
            this.sessionDurationFor(user),
        );

        res.status(HttpStatus.OK).json({
            token,
            username: user.username,
        });
    }

    @Post('logout')
    @UseGuards(AuthGuard)
    @ApiSecurity('jwt')
    @HttpCode(HttpStatus.OK)
    @ApiOkResponse({ type: LogoutResponseDTO })
    public async logout(
        @Req() req: AuthenticatedRequest,
    ): Promise<LogoutResponseDTO> {
        const { id: userId, sessionId } = req.user;
        if (sessionId !== undefined) {
            await revokeSessionById(sessionId, userId);
        }

        return { message: 'Logged out successfully' };
    }

    @Post('2fa/setup')
    @UseGuards(AuthGuard)
    @ApiSecurity('jwt')
    @NoBot()
    @ApiResponse({ status: 200, type: TotpSetupResponseDTO })
    public async setupTwoFactor(
        @Req() req: AuthenticatedRequest,
    ): Promise<TotpSetupResponseDTO> {
        const user = req.user;
        return await this.authService.setupTotp(user.id, user.username);
    }

    @Post('2fa/setup/confirm')
    @UseGuards(AuthGuard)
    @NoBot()
    @ApiSecurity('jwt')
    @ApiResponse({ status: 200, type: TotpSetupConfirmResponseDTO })
    public async confirmTwoFactorSetup(
        @Req() req: AuthenticatedRequest,
        @Body() body: TotpSetupConfirmRequestDTO,
    ): Promise<TotpSetupConfirmResponseDTO> {
        const user = req.user;
        const result = await this.authService.confirmTotpSetup(
            user.id,
            body.code,
        );
        await revokeAllSessionsForUser(user.id);

        const updatedUser = await this.userRepo.findById(user.id);
        if (updatedUser === null || updatedUser.deletedAt !== undefined) {
            throw new ApiError(401, ErrorMessages.AUTH.INVALID_TOKEN);
        }

        const { token } = await createSession(
            updatedUser.snowflakeId,
            req.headers['user-agent'] ?? 'unknown',
            extractClientIp(req),
            this.sessionDurationFor(updatedUser),
        );

        return { ...result, token };
    }

    @Post('2fa/verify')
    @Public()
    @HttpCode(HttpStatus.OK)
    @ApiResponse({ status: 200, type: LoginResponseDTO })
    @NoBot()
    public async verifyTwoFactor(
        @Body() body: TotpVerifyRequestDTO,
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<void> {
        if (
            (body.code === undefined || body.code === '') &&
            (body.backupCode === undefined || body.backupCode === '')
        ) {
            res.status(HttpStatus.BAD_REQUEST).json({
                error: ErrorMessages.AUTH.INVALID_TOTP_CODE,
            });
            return;
        }

        const payload = this.authService.verifyTempToken(body.tempToken);
        await this.authService.verifyTwoFactorCode({
            userId: payload.id,
            code: body.code,
            backupCode: body.backupCode,
            requireEnabled: true,
        });

        const user = await this.userRepo.findById(payload.id);
        if (user === null || user.deletedAt !== undefined) {
            throw new ApiError(401, ErrorMessages.AUTH.INVALID_TEMP_TOKEN);
        }
        const { token } = await createSession(
            user.snowflakeId,
            req.headers['user-agent'] ?? 'unknown',
            extractClientIp(req),
            this.sessionDurationFor(user),
        );

        res.status(HttpStatus.OK).json({
            token,
            username: user.username ?? payload.username,
        });
    }

    @Post('2fa/backup-codes/regenerate')
    @UseGuards(AuthGuard)
    @ApiSecurity('jwt')
    @NoBot()
    @ApiResponse({ status: 200, type: TotpSetupConfirmResponseDTO })
    public async regenerateBackupCodes(
        @Req() req: AuthenticatedRequest,
        @Body() body: TotpSensitiveActionRequestDTO,
    ): Promise<TotpSetupConfirmResponseDTO> {
        if (body.code === undefined || body.code === '') {
            throw new ApiError(400, ErrorMessages.AUTH.INVALID_TOTP_CODE);
        }
        const user = req.user;
        return await this.authService.regenerateBackupCodes(user.id, body.code);
    }

    @Post('2fa/disable')
    @UseGuards(AuthGuard)
    @NoBot()
    @ApiSecurity('jwt')
    @ApiOkResponse({ type: Disable2FAResponseDTO })
    public async disableTwoFactor(
        @Req() req: AuthenticatedRequest,
        @Body() body: TotpSensitiveActionRequestDTO,
    ): Promise<{ message: string; token: string }> {
        const hasCode = body.code !== undefined && body.code !== '';
        const hasBackupCode =
            body.backupCode !== undefined && body.backupCode !== '';
        if (!hasCode && !hasBackupCode) {
            throw new ApiError(400, ErrorMessages.AUTH.INVALID_TOTP_CODE);
        }

        const user = req.user;
        await this.authService.disableTwoFactor(
            user.id,
            body.code,
            body.backupCode,
        );

        await revokeAllSessionsForUser(user.id);

        const updatedUser = await this.userRepo.findById(user.id);
        if (updatedUser === null || updatedUser.deletedAt !== undefined) {
            throw new ApiError(401, ErrorMessages.AUTH.INVALID_TOKEN);
        }

        const { token } = await createSession(
            updatedUser.snowflakeId,
            req.headers['user-agent'] ?? 'unknown',
            extractClientIp(req),
            this.sessionDurationFor(updatedUser),
        );

        return {
            message: 'Two-factor authentication disabled successfully',
            token,
        };
    }

    @Post('register')
    @Public()
    @HttpCode(HttpStatus.OK)
    @NoBot()
    @ApiResponse({ status: 200, type: RegisterResponseDTO })
    @ApiResponse({ status: 400, description: 'Validation Error' })
    @ApiResponse({ status: 403, description: 'Invalid invite token' })
    @ApiResponse({ status: 500, description: 'Internal server error' })
    public async register(
        @Body() body: RegisterRequestDTO,
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<void> {
        const { login, username, password, invite, cfTurnstileResponse } = body;

        const isHuman = await verifyTurnstile(
            cfTurnstileResponse,
            extractClientIp(req),
        );
        if (!isHuman) {
            res.status(HttpStatus.BAD_REQUEST).json({
                error: 'Captcha verification failed. Please try again.',
            });
            return;
        }

        // Normalize email (lowercase and trim)
        const normalizedLogin = normalizeEmail(login);

        const unlock = await registerMutex.lock();
        try {
            let tokens: string[];
            try {
                const tokensPath = path.join(
                    process.cwd(),
                    '.data',
                    'tokens.txt',
                );
                if (!fs.existsSync(path.dirname(tokensPath))) {
                    fs.mkdirSync(path.dirname(tokensPath), { recursive: true });
                }
                if (!fs.existsSync(tokensPath)) {
                    fs.writeFileSync(tokensPath, '');
                }
                const file = fs.readFileSync(tokensPath, 'utf-8');
                tokens = file
                    .split(/\r?\n/)
                    .map((t) => t.trim())
                    .filter(Boolean);
            } catch {
                registrationAttemptsCounter.labels('failure').inc();
                res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                    error: ErrorMessages.SYSTEM.CANNOT_READ_TOKENS,
                });
                return;
            }

            if (tokens.includes(invite) === false) {
                registrationAttemptsCounter.labels('failure').inc();
                res.status(HttpStatus.FORBIDDEN).json({
                    error: ErrorMessages.INVITE.INVALID_TOKEN,
                });
                return;
            }

            const existingLogin =
                await this.userRepo.findByLogin(normalizedLogin);
            if (existingLogin !== null) {
                registrationAttemptsCounter.labels('failure').inc();
                res.status(HttpStatus.BAD_REQUEST).json({
                    error: ErrorMessages.AUTH.LOGIN_EXISTS,
                });
                return;
            }

            const existingUsername =
                await this.userRepo.findByUsername(username);
            if (existingUsername !== null) {
                registrationAttemptsCounter.labels('failure').inc();
                res.status(HttpStatus.BAD_REQUEST).json({
                    error: ErrorMessages.AUTH.USERNAME_EXISTS,
                });
                return;
            }

            await this.userRepo.create({
                login: normalizedLogin,
                username,
                password,
            });

            registrationAttemptsCounter.labels('success').inc();
            usersCreatedCounter.inc();

            const updatedTokens = tokens.filter((t) => t !== invite);
            const tokensPath = path.join(process.cwd(), '.data', 'tokens.txt');
            fs.writeFileSync(tokensPath, updatedTokens.join('\n'));

            const newUser = await this.userRepo.findByLogin(normalizedLogin);
            if (newUser === null)
                throw new ApiError(500, 'User just created but not found');

            const { token } = await createSession(
                newUser.snowflakeId,
                req.headers['user-agent'] ?? 'unknown',
                extractClientIp(req),
                this.sessionDurationFor(newUser),
            );

            res.status(HttpStatus.OK).json({ token });
        } finally {
            unlock();
        }
    }

    @Patch('login')
    @UseGuards(AuthGuard)
    @ApiSecurity('jwt')
    @ApiResponse({ status: 200, type: ChangeLoginResponseDTO })
    @ApiResponse({ status: 400, description: 'Invalid input' })
    @ApiResponse({ status: 401, description: 'Invalid password' })
    @ApiResponse({ status: 409, description: 'Login already taken' })
    @NoBot()
    public async changeLogin(
        @Req() req: AuthenticatedRequest,
        @Body() body: ChangeLoginRequestDTO,
    ): Promise<ChangeLoginResponseDTO> {
        const userId = req.user.id;
        const { newLogin, password } = body;

        const normalizedNewLogin = normalizeEmail(newLogin);

        const user = await this.userRepo.findById(userId);
        if (user === null) {
            throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        if (user.passwordless === true) {
            throw new ApiError(
                400,
                ErrorMessages.AUTH.PASSWORDLESS_NO_PASSWORD,
            );
        }

        const normalizedCurrentLogin = normalizeEmail(user.login ?? '');
        if (normalizedNewLogin === normalizedCurrentLogin) {
            throw new ApiError(400, ErrorMessages.AUTH.NEW_LOGIN_SAME);
        }

        const passwordValid = await this.userRepo.comparePassword(
            userId,
            password,
        );
        if (passwordValid !== true) {
            throw new ApiError(401, ErrorMessages.AUTH.INVALID_PASSWORD);
        }

        const existingLogin =
            await this.userRepo.findByLogin(normalizedNewLogin);
        if (existingLogin !== null) {
            throw new ApiError(409, ErrorMessages.AUTH.LOGIN_TAKEN);
        }

        await this.userRepo.updateLogin(userId, normalizedNewLogin);

        const updatedUser = await this.userRepo.findById(userId);
        if (updatedUser === null) {
            throw new ApiError(
                500,
                ErrorMessages.AUTH.FAILED_RETRIEVE_UPDATED_USER,
            );
        }

        const authHeader = req.headers['authorization'];
        const token =
            typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
                ? authHeader.slice('Bearer '.length).trim()
                : '';

        return {
            message: 'Login updated successfully',
            login: updatedUser.login ?? '',
            token,
        };
    }

    @Patch('password')
    @UseGuards(AuthGuard)
    @ApiSecurity('jwt')
    @ApiResponse({ status: 200, type: ChangePasswordResponseDTO })
    @ApiResponse({ status: 400, description: 'Invalid input' })
    @ApiResponse({ status: 401, description: 'Invalid current password' })
    @NoBot()
    public async changePassword(
        @Req() req: AuthenticatedRequest,
        @Body() body: ChangePasswordRequestDTO,
    ): Promise<ChangePasswordResponseDTO> {
        const userId = req.user.id;
        const { currentPassword, newPassword } = body;

        if (newPassword === currentPassword) {
            throw new ApiError(400, ErrorMessages.AUTH.NEW_PASSWORD_SAME);
        }

        const user = await this.userRepo.findById(userId);
        if (user === null) {
            throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        if (user.passwordless === true) {
            throw new ApiError(
                400,
                ErrorMessages.AUTH.PASSWORDLESS_NO_PASSWORD,
            );
        }

        const passwordValid = await this.userRepo.comparePassword(
            userId,
            currentPassword,
        );
        if (passwordValid !== true) {
            throw new ApiError(
                401,
                ErrorMessages.AUTH.INVALID_CURRENT_PASSWORD,
            );
        }

        await this.userRepo.updatePassword(userId, newPassword);
        await revokeAllSessionsForUser(userId);

        const updatedUser = await this.userRepo.findById(userId);
        if (updatedUser === null) {
            throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        const { token } = await createSession(
            updatedUser.snowflakeId,
            req.headers['user-agent'] ?? 'unknown',
            extractClientIp(req),
            this.sessionDurationFor(updatedUser),
        );

        return {
            message: 'Password updated successfully',
            token,
        };
    }
    @Post('password/reset')
    @Public()
    @HttpCode(HttpStatus.OK)
    @ApiResponse({ status: 200, type: PasswordResetResponseDTO })
    public async requestPasswordReset(
        @Body() body: PasswordResetRequestDTO,
        @Req() req: Request,
    ): Promise<PasswordResetResponseDTO> {
        // Extract real IP, handling proxies via X-Forwarded-For
        const ip = extractClientIp(req);

        const requestId = await this.authService.requestPasswordReset(
            body.email,
            ip,
        );

        return {
            message:
                'If an account with that email exists, a reset link has been sent.',
            requestId,
        };
    }

    @Post('password/reset/confirm')
    @Public()
    @HttpCode(HttpStatus.OK)
    @ApiResponse({ status: 200, type: PasswordResetResponseDTO })
    @ApiResponse({ status: 400, description: 'Invalid or expired token' })
    public async confirmPasswordReset(
        @Body() body: PasswordResetConfirmDTO,
    ): Promise<PasswordResetResponseDTO> {
        const { requestId, userId } =
            await this.authService.confirmPasswordReset(
                body.token,
                body.newPassword,
            );

        await revokeAllSessionsForUser(userId);

        return {
            message: 'Password has been reset successfully.',
            requestId,
        };
    }
}
