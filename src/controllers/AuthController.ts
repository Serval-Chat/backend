import {
    Controller,
    Post,
    Patch,
    Route,
    Body,
    Tags,
    Request,
    Response,
    Security,
} from 'tsoa';
import { injectable, inject } from 'inversify';
import { TYPES } from '@/di/types';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import { AuthService } from '@/services/AuthService';
import { generateJWT } from '@/utils/jwt';
import {
    loginAttemptsCounter,
    registrationAttemptsCounter,
    usersCreatedCounter,
} from '@/utils/metrics';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { ErrorResponse } from '@/controllers/models/ErrorResponse';
import { ErrorMessages } from '@/constants/errorMessages';

interface LoginRequest {
    login: string;
    password: string;
}

interface RegisterRequest {
    login: string;
    username: string;
    password: string;
    invite: string;
}

interface ChangeLoginRequest {
    newLogin: string;
    password?: string;
}

interface ChangePasswordRequest {
    currentPassword: string;
    newPassword: string;
}

// Controller for user authentication and account management
// Handles login, registration, and credential updates
@injectable()
@Route('api/v1/auth')
@Tags('Authentication')
export class AuthController extends Controller {
    constructor(
        @inject(TYPES.AuthService) private authService: AuthService,
        @inject(TYPES.UserRepository) private userRepo: IUserRepository,
    ) {
        super();
    }

    // Authenticates a user and returns a JWT
    @Post('login')
    @Response<ErrorResponse>('401', 'Invalid credentials', {
        error: ErrorMessages.AUTH.INVALID_LOGIN_PASSWORD,
    })
    @Response<ErrorResponse>('403', 'Account banned', {
        error: ErrorMessages.AUTH.ACCOUNT_BANNED,
    })
    public async login(
        @Body() body: LoginRequest,
        @Request() _req: express.Request,
    ): Promise<{ token: string; username: string }> {
        const { login, password } = body;

        const authResult = await this.authService.login(login, password);

        if (!authResult.success) {
            loginAttemptsCounter.labels('failure').inc();

            if (authResult.ban) {
                this.setStatus(403);
                return {
                    error: authResult.error,
                    ban: authResult.ban,
                } as any;
            }

            this.setStatus(401);
            return {
                error:
                    authResult.error || ErrorMessages.AUTH.INVALID_CREDENTIALS,
            } as any;
        }

        const user = authResult.user;

        loginAttemptsCounter.labels('success').inc();

        const token = generateJWT({
            id: user._id.toString(),
            login: user.login,
            username: user.username,
            tokenVersion: user.tokenVersion || 0,
            permissions: user.permissions,
        });

        return {
            token,
            username: user.username,
        };
    }

    // Registers a new user using an invite token
    @Post('register')
    @Response<ErrorResponse>('400', 'Validation Error', {
        error: ErrorMessages.AUTH.USERNAME_EXISTS,
    })
    @Response<ErrorResponse>('403', 'Invalid invite token', {
        error: ErrorMessages.INVITE.INVALID_TOKEN,
    })
    @Response<ErrorResponse>('500', 'Internal server error', {
        error: ErrorMessages.SYSTEM.CANNOT_READ_TOKENS,
    })
    public async register(
        @Body() body: RegisterRequest,
    ): Promise<{ token: string }> {
        const { login, username, password, invite } = body;

        if (!login || !login.includes('@')) {
            this.setStatus(400);
            return { error: ErrorMessages.AUTH.INVALID_EMAIL } as any;
        }

        if (!username || username.length < 3) {
            this.setStatus(400);
            return { error: ErrorMessages.AUTH.USERNAME_TOO_SHORT } as any;
        }

        if (!password || password.length < 6) {
            this.setStatus(400);
            return { error: ErrorMessages.AUTH.PASSWORD_TOO_SHORT } as any;
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
            this.setStatus(500);
            return { error: ErrorMessages.SYSTEM.CANNOT_READ_TOKENS } as any;
        }

        if (!tokens.includes(invite)) {
            registrationAttemptsCounter.labels('failure').inc();
            this.setStatus(403);
            return { error: ErrorMessages.INVITE.INVALID_TOKEN } as any;
        }

        const existingLogin = await this.userRepo.findByLogin(login);
        if (existingLogin) {
            registrationAttemptsCounter.labels('failure').inc();
            this.setStatus(400);
            return { error: ErrorMessages.AUTH.LOGIN_EXISTS } as any;
        }

        const existingUsername = await this.userRepo.findByUsername(username);
        if (existingUsername) {
            registrationAttemptsCounter.labels('failure').inc();
            this.setStatus(400);
            return { error: ErrorMessages.AUTH.USERNAME_EXISTS } as any;
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

        return { token };
    }

    // Updates the current user's login identifier
    @Patch('login')
    @Security('jwt')
    @Response<ErrorResponse>('400', 'Invalid input', {
        error: ErrorMessages.AUTH.NEW_LOGIN_REQUIRED,
    })
    @Response<ErrorResponse>('401', 'Invalid password', {
        error: ErrorMessages.AUTH.INVALID_PASSWORD,
    })
    @Response<ErrorResponse>('409', 'Login already taken', {
        error: ErrorMessages.AUTH.LOGIN_TAKEN,
    })
    public async changeLogin(
        @Request() req: express.Request,
        @Body() body: ChangeLoginRequest,
    ): Promise<{ message: string; login: string; token: string }> {
        // @ts-ignore
        const userId = req.user.id;
        const { newLogin, password } = body;

        if (!newLogin || typeof newLogin !== 'string') {
            this.setStatus(400);
            throw new Error(ErrorMessages.AUTH.NEW_LOGIN_REQUIRED);
        }

        if (
            !password ||
            typeof password !== 'string' ||
            password.length === 0
        ) {
            this.setStatus(400);
            throw new Error(ErrorMessages.AUTH.PASSWORD_CONFIRM_REQUIRED);
        }

        const trimmedLogin = newLogin.trim();
        if (trimmedLogin.length === 0) {
            this.setStatus(400);
            throw new Error(ErrorMessages.AUTH.NEW_LOGIN_EMPTY);
        }

        // Allow 3–24 chars: letters, numbers, dot, underscore, dash
        const loginRegex = /^[a-zA-Z0-9._-]{3,24}$/;
        if (!loginRegex.test(trimmedLogin)) {
            this.setStatus(400);
            throw new Error(ErrorMessages.AUTH.LOGIN_FORMAT);
        }

        const user = await this.userRepo.findById(userId);
        if (!user) {
            this.setStatus(404);
            throw new Error(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        if (trimmedLogin === user.login) {
            this.setStatus(400);
            throw new Error(ErrorMessages.AUTH.NEW_LOGIN_SAME);
        }

        const passwordValid = await this.userRepo.comparePassword(
            userId,
            password,
        );
        if (!passwordValid) {
            this.setStatus(401);
            throw new Error(ErrorMessages.AUTH.INVALID_PASSWORD);
        }

        const existingLogin = await this.userRepo.findByUsername(trimmedLogin);
        if (existingLogin) {
            this.setStatus(409);
            throw new Error(ErrorMessages.AUTH.LOGIN_TAKEN);
        }

        await this.userRepo.updateLogin(userId, trimmedLogin);

        const updatedUser = await this.userRepo.findById(userId);
        if (!updatedUser) {
            this.setStatus(500);
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
    @Security('jwt')
    @Response<ErrorResponse>('400', 'Invalid input', {
        error: ErrorMessages.AUTH.NEW_PASSWORD_TOO_SHORT,
    })
    @Response<ErrorResponse>('401', 'Invalid current password', {
        error: ErrorMessages.AUTH.INVALID_CURRENT_PASSWORD,
    })
    public async changePassword(
        @Request() req: express.Request,
        @Body() body: ChangePasswordRequest,
    ): Promise<{ message: string; token: string }> {
        // @ts-ignore
        const userId = req.user.id;
        const { currentPassword, newPassword } = body;

        if (!currentPassword || typeof currentPassword !== 'string') {
            this.setStatus(400);
            throw new Error(ErrorMessages.AUTH.CURRENT_PASSWORD_REQUIRED);
        }

        if (!newPassword || typeof newPassword !== 'string') {
            this.setStatus(400);
            throw new Error(ErrorMessages.AUTH.NEW_PASSWORD_REQUIRED);
        }

        if (newPassword.length < 8) {
            this.setStatus(400);
            throw new Error(ErrorMessages.AUTH.NEW_PASSWORD_TOO_SHORT);
        }

        if (newPassword.length > 128) {
            this.setStatus(400);
            throw new Error(ErrorMessages.AUTH.PASSWORD_TOO_LONG);
        }

        if (newPassword === currentPassword) {
            this.setStatus(400);
            throw new Error(ErrorMessages.AUTH.NEW_PASSWORD_SAME);
        }

        const user = await this.userRepo.findById(userId);
        if (!user) {
            this.setStatus(404);
            throw new Error(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        const passwordValid = await this.userRepo.comparePassword(
            userId,
            currentPassword,
        );
        if (!passwordValid) {
            this.setStatus(401);
            throw new Error(ErrorMessages.AUTH.INVALID_CURRENT_PASSWORD);
        }

        // Require letters, numbers, and symbols for password strength
        const hasLetter = /[a-zA-Z]/.test(newPassword);
        const hasNumber = /[0-9]/.test(newPassword);
        const hasSymbol = /[^a-zA-Z0-9]/.test(newPassword);

        if (!(hasLetter && hasNumber && hasSymbol)) {
            this.setStatus(400);
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
