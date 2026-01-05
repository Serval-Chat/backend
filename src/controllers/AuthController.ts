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
import { generateJWT } from '@/utils/jwt';
import {
    loginAttemptsCounter,
    registrationAttemptsCounter,
    usersCreatedCounter,
} from '@/utils/metrics';
import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { ErrorMessages } from '@/constants/errorMessages';
import { ApiTags, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { ILogger } from '@/di/interfaces/ILogger';
import type { JWTPayload } from '@/utils/jwt';

interface RequestWithUser extends Request {
    user: JWTPayload;
}

import {
    LoginRequestDTO,
    RegisterRequestDTO,
    ChangeLoginRequestDTO,
    ChangePasswordRequestDTO,
} from './dto/auth.request.dto';
import {
    LoginResponseDTO,
    RegisterResponseDTO,
    ChangeLoginResponseDTO,
    ChangePasswordResponseDTO,
} from './dto/auth.response.dto';

import { injectable, inject } from 'inversify';

// Controller for user authentication and account management
// Handles login, registration, and credential updates
@ApiTags('Authentication')
@injectable()
@Controller('api/v1/auth')
export class AuthController {
    constructor(
        @inject(TYPES.Logger) @Inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.AuthService) @Inject(TYPES.AuthService) private authService: AuthService,
        @inject(TYPES.UserRepository) @Inject(TYPES.UserRepository) private userRepo: IUserRepository,
    ) { }

    // Authenticates a user and returns a JWT
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

        if (!authResult.success) {
            loginAttemptsCounter.labels('failure').inc();

            if (authResult.ban) {
                res.status(HttpStatus.FORBIDDEN).json({
                    error: authResult.error,
                    ban: authResult.ban,
                });
                return;
            }

            res.status(HttpStatus.UNAUTHORIZED).json({
                error: authResult.error || ErrorMessages.AUTH.INVALID_CREDENTIALS,
            });
            return;
        }

        const user = authResult.user;
        if (!user) {
            this.logger.error(
                'Auth success but user missing in result',
            );
            res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                error: ErrorMessages.AUTH.INVALID_CREDENTIALS,
            });
            return;
        }

        loginAttemptsCounter.labels('success').inc();

        const token = generateJWT({
            id: user._id.toString(),
            login: user.login,
            username: user.username,
            tokenVersion: user.tokenVersion || 0,
            permissions: user.permissions,
        });

        res.status(HttpStatus.OK).json({
            token,
            username: user.username,
        });
    }

    // Registers a new user using an invite token
    @Post('register')
    @HttpCode(HttpStatus.OK)
    @ApiResponse({ status: 200, type: RegisterResponseDTO })
    @ApiResponse({ status: 400, description: 'Validation Error' })
    @ApiResponse({ status: 403, description: 'Invalid invite token' })
    @ApiResponse({ status: 500, description: 'Internal server error' })
    public async register(
        @Body() body: RegisterRequestDTO,
        @Res() res: Response,
    ): Promise<void> {
        const { login, username, password, invite } = body;

        if (!login || !login.includes('@')) {
            res.status(HttpStatus.BAD_REQUEST).json({ error: ErrorMessages.AUTH.INVALID_EMAIL });
            return;
        }

        if (!username || username.length < 3) {
            res.status(HttpStatus.BAD_REQUEST).json({ error: ErrorMessages.AUTH.USERNAME_TOO_SHORT });
            return;
        }

        if (!password || password.length < 6) {
            res.status(HttpStatus.BAD_REQUEST).json({ error: ErrorMessages.AUTH.PASSWORD_TOO_SHORT });
            return;
        }

        let tokens: string[];
        try {
            // Read valid invite tokens from tokens.txt; failure blocks registration
            const file = fs.readFileSync(path.join('tokens.txt'), 'utf-8');
            tokens = file
                .split(/\r?\n/)
                .map((t) => t.trim())
                .filter(Boolean);
        } catch {
            registrationAttemptsCounter.labels('failure').inc();
            res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: ErrorMessages.SYSTEM.CANNOT_READ_TOKENS });
            return;
        }

        if (!tokens.includes(invite)) {
            registrationAttemptsCounter.labels('failure').inc();
            res.status(HttpStatus.FORBIDDEN).json({ error: ErrorMessages.INVITE.INVALID_TOKEN });
            return;
        }

        const existingLogin = await this.userRepo.findByLogin(login);
        if (existingLogin) {
            registrationAttemptsCounter.labels('failure').inc();
            res.status(HttpStatus.BAD_REQUEST).json({ error: ErrorMessages.AUTH.LOGIN_EXISTS });
            return;
        }

        const existingUsername = await this.userRepo.findByUsername(username);
        if (existingUsername) {
            registrationAttemptsCounter.labels('failure').inc();
            res.status(HttpStatus.BAD_REQUEST).json({ error: ErrorMessages.AUTH.USERNAME_EXISTS });
            return;
        }

        await this.userRepo.create({ login, username, password });

        registrationAttemptsCounter.labels('success').inc();
        usersCreatedCounter.inc();

        const updatedTokens = tokens.filter((t) => t !== invite);
        fs.writeFileSync('tokens.txt', updatedTokens.join('\n'));

        const newUser = await this.userRepo.findByLogin(login);
        if (!newUser) throw new Error('User just created but not found');

        const token = generateJWT({
            id: newUser._id.toString(),
            login: newUser.login!,
            username: newUser.username!,
            tokenVersion: newUser.tokenVersion || 0,
            permissions: newUser.permissions,
        });

        res.status(HttpStatus.OK).json({ token });
    }

    // Updates the current user's login identifier
    @Patch('login')
    @UseGuards(JwtAuthGuard)
    @ApiSecurity('jwt')
    @ApiResponse({ status: 200, type: ChangeLoginResponseDTO })
    @ApiResponse({ status: 400, description: 'Invalid input' })
    @ApiResponse({ status: 401, description: 'Invalid password' })
    @ApiResponse({ status: 409, description: 'Login already taken' })
    public async changeLogin(
        @Req() req: Request,
        @Body() body: ChangeLoginRequestDTO,
    ): Promise<ChangeLoginResponseDTO> {
        const userId = (req as unknown as RequestWithUser).user.id;
        const { newLogin, password } = body;

        if (!newLogin || typeof newLogin !== 'string') {
            throw new Error(ErrorMessages.AUTH.NEW_LOGIN_REQUIRED);
        }

        if (
            !password ||
            typeof password !== 'string' ||
            password.length === 0
        ) {
            throw new Error(ErrorMessages.AUTH.PASSWORD_CONFIRM_REQUIRED);
        }

        const trimmedLogin = newLogin.trim();
        if (trimmedLogin.length === 0) {
            throw new Error(ErrorMessages.AUTH.NEW_LOGIN_EMPTY);
        }

        // Allow 3–24 chars: letters, numbers, dot, underscore, dash
        const loginRegex = /^[a-zA-Z0-9._-]{3,24}$/;
        if (!loginRegex.test(trimmedLogin)) {
            throw new Error(ErrorMessages.AUTH.LOGIN_FORMAT);
        }

        const user = await this.userRepo.findById(userId);
        if (!user) {
            throw new Error(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        if (trimmedLogin === user.login) {
            throw new Error(ErrorMessages.AUTH.NEW_LOGIN_SAME);
        }

        const passwordValid = await this.userRepo.comparePassword(
            userId,
            password,
        );
        if (!passwordValid) {
            throw new Error(ErrorMessages.AUTH.INVALID_PASSWORD);
        }

        const existingLogin = await this.userRepo.findByUsername(trimmedLogin);
        if (existingLogin) {
            throw new Error(ErrorMessages.AUTH.LOGIN_TAKEN);
        }

        await this.userRepo.updateLogin(userId, trimmedLogin);

        const updatedUser = await this.userRepo.findById(userId);
        if (!updatedUser) {
            throw new Error(ErrorMessages.AUTH.FAILED_RETRIEVE_UPDATED_USER);
        }

        const token = generateJWT({
            id: updatedUser._id.toString(),
            login: updatedUser.login || '',
            username: updatedUser.username || '',
            tokenVersion: updatedUser.tokenVersion || 0,
            permissions: updatedUser.permissions,
        });

        return {
            message: 'Login updated successfully',
            login: updatedUser.login || '',
            token,
        };
    }

    // Updates the current user's password
    @Patch('password')
    @UseGuards(JwtAuthGuard)
    @ApiSecurity('jwt')
    @ApiResponse({ status: 200, type: ChangePasswordResponseDTO })
    @ApiResponse({ status: 400, description: 'Invalid input' })
    @ApiResponse({ status: 401, description: 'Invalid current password' })
    public async changePassword(
        @Req() req: Request,
        @Body() body: ChangePasswordRequestDTO,
    ): Promise<ChangePasswordResponseDTO> {
        const userId = (req as unknown as RequestWithUser).user.id;
        const { currentPassword, newPassword } = body;

        if (!currentPassword || typeof currentPassword !== 'string') {
            throw new Error(ErrorMessages.AUTH.CURRENT_PASSWORD_REQUIRED);
        }

        if (!newPassword || typeof newPassword !== 'string') {
            throw new Error(ErrorMessages.AUTH.NEW_PASSWORD_REQUIRED);
        }

        if (newPassword.length < 8) {
            throw new Error(ErrorMessages.AUTH.NEW_PASSWORD_TOO_SHORT);
        }

        if (newPassword.length > 128) {
            throw new Error(ErrorMessages.AUTH.PASSWORD_TOO_LONG);
        }

        if (newPassword === currentPassword) {
            throw new Error(ErrorMessages.AUTH.NEW_PASSWORD_SAME);
        }

        const user = await this.userRepo.findById(userId);
        if (!user) {
            throw new Error(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        const passwordValid = await this.userRepo.comparePassword(
            userId,
            currentPassword,
        );
        if (!passwordValid) {
            throw new Error(ErrorMessages.AUTH.INVALID_CURRENT_PASSWORD);
        }

        // Require letters, numbers, and symbols for password strength
        const hasLetter = /[a-zA-Z]/.test(newPassword);
        const hasNumber = /[0-9]/.test(newPassword);
        const hasSymbol = /[^a-zA-Z0-9]/.test(newPassword);

        if (!(hasLetter && hasNumber && hasSymbol)) {
            throw new Error(ErrorMessages.AUTH.PASSWORD_STRENGTH);
        }

        await this.userRepo.updatePassword(userId, newPassword);

        const token = generateJWT({
            id: user._id.toString(),
            login: user.login || '',
            username: user.username || '',
            tokenVersion: user.tokenVersion || 0,
            permissions: user.permissions,
        });

        return {
            message: 'Password updated successfully',
            token,
        };
    }
}
