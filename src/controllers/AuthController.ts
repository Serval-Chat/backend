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
import { Types } from 'mongoose';
import { TYPES } from '@/di/types';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import { AuthService } from '@/services/AuthService';
import { generateJWT } from '@/utils/jwt';
import { generateTwoFactorTempToken } from '@/utils/jwt';
import {
    loginAttemptsCounter,
    registrationAttemptsCounter,
    usersCreatedCounter,
} from '@/utils/metrics';
import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { extractClientIp } from '@/utils/ip';
import { ErrorMessages } from '@/constants/errorMessages';
import { ApiError } from '@/utils/ApiError';
import { normalizeEmail } from '@/utils/email';
import { ApiTags, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { ILogger } from '@/di/interfaces/ILogger';
import type { JWTPayload } from '@/utils/jwt';

interface RequestWithUser extends Request {
    user: JWTPayload;
}

import {
    LoginResponseDTO,
    RegisterResponseDTO,
    ChangeLoginResponseDTO,
    ChangePasswordResponseDTO,
    PasswordResetResponseDTO,
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

import { injectable } from 'inversify';

import { NoBot } from '@/modules/auth/bot.decorator';

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
@injectable()
@Controller('api/v1/auth')
export class AuthController {
    public constructor(
        @Inject(TYPES.Logger) private logger: ILogger,
        @Inject(TYPES.AuthService)
        private authService: AuthService,
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
    ) {}

    @Post('login')
    @HttpCode(HttpStatus.OK)
    @ApiResponse({ status: 200, type: LoginResponseDTO })
    @ApiResponse({ status: 401, description: 'Invalid credentials' })
    @ApiResponse({ status: 403, description: 'Account banned' })
    public async login(
        @Body() body: LoginRequestDTO,
        @Res() res: Response,
    ): Promise<void> {
        const { login, password } = body;

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
                id: user._id.toString(),
                login: login,
                username: user.username as string,
                tokenVersion: user.tokenVersion ?? 0,
            });

            res.status(HttpStatus.OK).json({
                temp_token,
                two_factor_required: true,
                username: user.username,
            });
            return;
        }

        const token = generateJWT({
            id: user._id.toString(),
            login: login,
            username: user.username as string,
            tokenVersion: user.tokenVersion ?? 0,
            permissions: user.permissions,
            isBot: user.isBot ?? false,
        });

        res.status(HttpStatus.OK).json({
            token,
            username: user.username,
        });
    }

    @Post('2fa/setup')
    @UseGuards(JwtAuthGuard)
    @ApiSecurity('jwt')
    @NoBot()
    @ApiResponse({ status: 200, type: TotpSetupResponseDTO })
    public async setupTwoFactor(
        @Req() req: Request,
    ): Promise<TotpSetupResponseDTO> {
        const user = (req as unknown as RequestWithUser).user;
        return await this.authService.setupTotp(user.id, user.username);
    }

    @Post('2fa/setup/confirm')
    @UseGuards(JwtAuthGuard)
    @ApiSecurity('jwt')
    @ApiResponse({ status: 200, type: TotpSetupConfirmResponseDTO })
    public async confirmTwoFactorSetup(
        @Req() req: Request,
        @Body() body: TotpSetupConfirmRequestDTO,
    ): Promise<TotpSetupConfirmResponseDTO> {
        const user = (req as unknown as RequestWithUser).user;
        return await this.authService.confirmTotpSetup(user.id, body.code);
    }

    @Post('2fa/verify')
    @HttpCode(HttpStatus.OK)
    @ApiResponse({ status: 200, type: LoginResponseDTO })
    @NoBot()
    public async verifyTwoFactor(
        @Body() body: TotpVerifyRequestDTO,
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

        const user = await this.userRepo.findById(
            new Types.ObjectId(payload.id),
        );
        if (user === null || user.deletedAt !== undefined) {
            throw new ApiError(401, ErrorMessages.AUTH.INVALID_TEMP_TOKEN);
        }
        const token = generateJWT({
            id: user._id.toString(),
            login: user.login ?? payload.login,
            username: user.username ?? payload.username,
            tokenVersion: user.tokenVersion ?? 0,
            permissions: user.permissions,
            isBot: user.isBot ?? false,
        });

        res.status(HttpStatus.OK).json({
            token,
            username: user.username ?? payload.username,
        });
    }

    @Post('2fa/backup-codes/regenerate')
    @UseGuards(JwtAuthGuard)
    @ApiSecurity('jwt')
    @NoBot()
    @ApiResponse({ status: 200, type: TotpSetupConfirmResponseDTO })
    public async regenerateBackupCodes(
        @Req() req: Request,
        @Body() body: TotpSensitiveActionRequestDTO,
    ): Promise<TotpSetupConfirmResponseDTO> {
        if (body.code === undefined || body.code === '') {
            throw new ApiError(400, ErrorMessages.AUTH.INVALID_TOTP_CODE);
        }
        const user = (req as unknown as RequestWithUser).user;
        return await this.authService.regenerateBackupCodes(user.id, body.code);
    }

    @Post('2fa/disable')
    @UseGuards(JwtAuthGuard)
    @NoBot()
    @ApiSecurity('jwt')
    @ApiResponse({ status: 200 })
    public async disableTwoFactor(
        @Req() req: Request,
        @Body() body: TotpSensitiveActionRequestDTO,
    ): Promise<{ message: string }> {
        const user = (req as unknown as RequestWithUser).user;
        await this.authService.disableTwoFactor(
            user.id,
            body.code,
            body.backupCode,
        );
        return { message: 'Two-factor authentication disabled successfully' };
    }

    @Post('register')
    @HttpCode(HttpStatus.OK)
    @NoBot()
    @ApiResponse({ status: 200, type: RegisterResponseDTO })
    @ApiResponse({ status: 400, description: 'Validation Error' })
    @ApiResponse({ status: 403, description: 'Invalid invite token' })
    @ApiResponse({ status: 500, description: 'Internal server error' })
    public async register(
        @Body() body: RegisterRequestDTO,
        @Res() res: Response,
    ): Promise<void> {
        const { login, username, password, invite } = body;

        if (login.includes('+')) {
            registrationAttemptsCounter.labels('failure').inc();
            res.status(HttpStatus.BAD_REQUEST).json({
                error: 'Subaddresses are not allowed.',
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

            const token = generateJWT({
                id: newUser._id.toString(),
                login: newUser.login ?? '',
                username: newUser.username ?? '',
                tokenVersion: newUser.tokenVersion ?? 0,
                permissions: newUser.permissions,
                isBot: newUser.isBot ?? false,
            });

            res.status(HttpStatus.OK).json({ token });
        } finally {
            unlock();
        }
    }

    @Patch('login')
    @UseGuards(JwtAuthGuard)
    @ApiSecurity('jwt')
    @ApiResponse({ status: 200, type: ChangeLoginResponseDTO })
    @ApiResponse({ status: 400, description: 'Invalid input' })
    @ApiResponse({ status: 401, description: 'Invalid password' })
    @ApiResponse({ status: 409, description: 'Login already taken' })
    @NoBot()
    public async changeLogin(
        @Req() req: Request,
        @Body() body: ChangeLoginRequestDTO,
    ): Promise<ChangeLoginResponseDTO> {
        const userId = (req as unknown as RequestWithUser).user.id;
        const userOid = new Types.ObjectId(userId);
        const { newLogin, password } = body;

        if (newLogin.includes('+')) {
            throw new ApiError(400, 'Subaddresses are not allowed.');
        }

        const normalizedNewLogin = normalizeEmail(newLogin);

        const user = await this.userRepo.findById(userOid);
        if (user === null) {
            throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        const normalizedCurrentLogin = normalizeEmail(user.login ?? '');
        if (normalizedNewLogin === normalizedCurrentLogin) {
            throw new ApiError(400, ErrorMessages.AUTH.NEW_LOGIN_SAME);
        }

        const passwordValid = await this.userRepo.comparePassword(
            userOid,
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

        await this.userRepo.updateLogin(userOid, normalizedNewLogin);

        const updatedUser = await this.userRepo.findById(userOid);
        if (updatedUser === null) {
            throw new ApiError(
                500,
                ErrorMessages.AUTH.FAILED_RETRIEVE_UPDATED_USER,
            );
        }

        const token = generateJWT({
            id: updatedUser._id.toString(),
            login: updatedUser.login ?? '',
            username: updatedUser.username ?? '',
            tokenVersion: updatedUser.tokenVersion ?? 0,
            permissions: updatedUser.permissions,
            isBot: updatedUser.isBot ?? false,
        });

        return {
            message: 'Login updated successfully',
            login: updatedUser.login ?? '',
            token,
        };
    }

    @Patch('password')
    @UseGuards(JwtAuthGuard)
    @ApiSecurity('jwt')
    @ApiResponse({ status: 200, type: ChangePasswordResponseDTO })
    @ApiResponse({ status: 400, description: 'Invalid input' })
    @ApiResponse({ status: 401, description: 'Invalid current password' })
    @NoBot()
    public async changePassword(
        @Req() req: Request,
        @Body() body: ChangePasswordRequestDTO,
    ): Promise<ChangePasswordResponseDTO> {
        const userId = (req as unknown as RequestWithUser).user.id;
        const userOid = new Types.ObjectId(userId);
        const { currentPassword, newPassword } = body;

        if (newPassword === currentPassword) {
            throw new ApiError(400, ErrorMessages.AUTH.NEW_PASSWORD_SAME);
        }

        const user = await this.userRepo.findById(userOid);
        if (user === null) {
            throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        const passwordValid = await this.userRepo.comparePassword(
            userOid,
            currentPassword,
        );
        if (passwordValid !== true) {
            throw new ApiError(
                401,
                ErrorMessages.AUTH.INVALID_CURRENT_PASSWORD,
            );
        }

        await this.userRepo.updatePassword(userOid, newPassword);

        const token = generateJWT({
            id: user._id.toString(),
            login: user.login ?? '',
            username: user.username ?? '',
            tokenVersion: user.tokenVersion ?? 0,
            permissions: user.permissions,
            isBot: user.isBot ?? false,
        });

        return {
            message: 'Password updated successfully',
            token,
        };
    }
    @Post('password/reset')
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
    @HttpCode(HttpStatus.OK)
    @ApiResponse({ status: 200, type: PasswordResetResponseDTO })
    @ApiResponse({ status: 400, description: 'Invalid or expired token' })
    public async confirmPasswordReset(
        @Body() body: PasswordResetConfirmDTO,
    ): Promise<PasswordResetResponseDTO> {
        const requestId = await this.authService.confirmPasswordReset(
            body.token,
            body.newPassword,
        );

        return {
            message: 'Password has been reset successfully.',
            requestId,
        };
    }
}
