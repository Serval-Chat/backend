import {
    Controller,
    Post,
    Body,
    Req,
    Res,
    UseGuards,
    Inject,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags, ApiSecurity, ApiResponse } from '@nestjs/swagger';
import { TYPES } from '@/di/types';
import { AuthGuard } from '@/modules/auth/auth.module';
import { Public } from '@/modules/auth/public.decorator';
import { NoBot } from '@/modules/auth/bot.decorator';
import { CurrentUser } from '@/modules/auth/current-user.decorator';
import { PasswordlessService } from '@/services/PasswordlessService';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import { createSession, revokeAllSessionsForUser } from '@/utils/sessionAuth';
import { extractClientIp } from '@/utils/ip';
import { verifyTurnstile } from '@/utils/turnstile';
import { SessionDuration } from '@/models/User';
import { ApiError } from '@/utils/ApiError';
import { ErrorMessages } from '@/constants/errorMessages';
import {
    EnablePasswordlessResponseDTO,
    RegenerateRecoveryKeysOptionsResponseDTO,
    RegenerateRecoveryKeysVerifyResponseDTO,
    RecoveryKeyLoginResponseDTO,
} from './dto/passwordless.response.dto';
import {
    EnablePasswordlessRequestDTO,
    RegenerateRecoveryKeysVerifyRequestDTO,
    RecoveryKeyLoginRequestDTO,
} from './dto/passwordless.request.dto';

@ApiTags('Passwordless')
@Controller('api/v1/auth/passwordless')
export class PasswordlessController {
    public constructor(
        @Inject(TYPES.PasswordlessService)
        private passwordlessService: PasswordlessService,
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
    ) {}

    private sessionDurationFor(user: {
        settings?: { sessionDuration?: string };
    }): string {
        return user.settings?.sessionDuration ?? SessionDuration.THIRTY_DAYS;
    }

    @Post('enable')
    @UseGuards(AuthGuard)
    @ApiSecurity('jwt')
    @NoBot()
    @ApiResponse({ status: 200, type: EnablePasswordlessResponseDTO })
    public async enable(
        @CurrentUser('id') userId: string,
        @Req() req: Request,
        @Body() body: EnablePasswordlessRequestDTO,
    ): Promise<EnablePasswordlessResponseDTO> {
        const recoveryKeys = await this.passwordlessService.enable(
            userId,
            body.password,
        );

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

        return { recoveryKeys, token };
    }

    @Post('recovery-keys/regenerate/options')
    @UseGuards(AuthGuard)
    @ApiSecurity('jwt')
    @NoBot()
    @ApiResponse({
        status: 200,
        type: RegenerateRecoveryKeysOptionsResponseDTO,
    })
    public async regenerateRecoveryKeysOptions(): Promise<RegenerateRecoveryKeysOptionsResponseDTO> {
        return this.passwordlessService.regenerateRecoveryKeysOptions();
    }

    @Post('recovery-keys/regenerate/verify')
    @UseGuards(AuthGuard)
    @ApiSecurity('jwt')
    @NoBot()
    @ApiResponse({
        status: 200,
        type: RegenerateRecoveryKeysVerifyResponseDTO,
    })
    public async regenerateRecoveryKeysVerify(
        @CurrentUser('id') userId: string,
        @Body() body: RegenerateRecoveryKeysVerifyRequestDTO,
    ): Promise<RegenerateRecoveryKeysVerifyResponseDTO> {
        const recoveryKeys =
            await this.passwordlessService.regenerateRecoveryKeysVerify(
                userId,
                body.flowId,
                body.credential,
            );
        return { recoveryKeys };
    }

    @Post('recover')
    @Public()
    @NoBot()
    @HttpCode(HttpStatus.OK)
    @ApiResponse({ status: 200, type: RecoveryKeyLoginResponseDTO })
    @ApiResponse({ status: 401, description: 'Invalid credentials' })
    @ApiResponse({ status: 403, description: 'Account banned' })
    public async recover(
        @Body() body: RecoveryKeyLoginRequestDTO,
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<void> {
        const isHuman = await verifyTurnstile(
            body.cfTurnstileResponse,
            extractClientIp(req),
        );
        if (!isHuman) {
            res.status(HttpStatus.BAD_REQUEST).json({
                error: 'Captcha verification failed. Please try again.',
            });
            return;
        }

        const result = await this.passwordlessService.loginWithRecoveryKey(
            body.login,
            body.recoveryKey,
        );

        if (result.success === false || result.user === undefined) {
            if (result.ban) {
                res.status(HttpStatus.FORBIDDEN).json({
                    error: result.error,
                    ban: result.ban,
                });
                return;
            }

            res.status(HttpStatus.UNAUTHORIZED).json({
                error: result.error,
            });
            return;
        }

        const user = result.user;
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
}
