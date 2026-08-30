import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Param,
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
import type { JWTPayload } from '@/utils/jwt';
import { PasskeyService } from '@/services/PasskeyService';
import { createSession } from '@/utils/sessionAuth';
import { extractClientIp } from '@/utils/ip';
import { SessionDuration } from '@/models/User';
import {
    PasskeyListResponseDTO,
    PasskeyRegistrationOptionsResponseDTO,
    PasskeyRegistrationVerifyResponseDTO,
    PasskeyAuthenticationOptionsResponseDTO,
    PasskeyLoginResponseDTO,
    PasskeyCredentialDTO,
    PasskeyDeleteResponseDTO,
} from './dto/passkey.response.dto';
import {
    PasskeyRegistrationVerifyRequestDTO,
    PasskeyAuthenticationVerifyRequestDTO,
    RenamePasskeyRequestDTO,
} from './dto/passkey.request.dto';

@ApiTags('Passkeys')
@Controller('api/v1/auth/passkey')
export class PasskeyController {
    public constructor(
        @Inject(TYPES.PasskeyService)
        private passkeyService: PasskeyService,
    ) {}

    private sessionDurationFor(user: {
        settings?: { sessionDuration?: string };
    }): string {
        return user.settings?.sessionDuration ?? SessionDuration.THIRTY_DAYS;
    }

    @Get()
    @UseGuards(AuthGuard)
    @ApiSecurity('jwt')
    @NoBot()
    @ApiResponse({ status: 200, type: PasskeyListResponseDTO })
    public async listPasskeys(
        @CurrentUser('id') userId: string,
    ): Promise<PasskeyListResponseDTO> {
        const passkeys = await this.passkeyService.listCredentials(userId);
        return { passkeys };
    }

    @Post('register/options')
    @UseGuards(AuthGuard)
    @ApiSecurity('jwt')
    @NoBot()
    @ApiResponse({ status: 200, type: PasskeyRegistrationOptionsResponseDTO })
    public async startRegistration(
        @CurrentUser() user: JWTPayload,
    ): Promise<PasskeyRegistrationOptionsResponseDTO> {
        const options = await this.passkeyService.generateRegistrationOptions(
            user.id,
            user.login,
            user.username,
        );
        return { options };
    }

    @Post('register/verify')
    @UseGuards(AuthGuard)
    @ApiSecurity('jwt')
    @NoBot()
    @ApiResponse({ status: 200, type: PasskeyRegistrationVerifyResponseDTO })
    public async verifyRegistration(
        @CurrentUser('id') userId: string,
        @Body() body: PasskeyRegistrationVerifyRequestDTO,
    ): Promise<PasskeyRegistrationVerifyResponseDTO> {
        const passkey = await this.passkeyService.verifyRegistration(
            userId,
            body.credential,
            body.name,
        );
        return { passkey };
    }

    @Patch(':credentialId')
    @UseGuards(AuthGuard)
    @ApiSecurity('jwt')
    @NoBot()
    @ApiResponse({ status: 200, type: PasskeyCredentialDTO })
    public async renamePasskey(
        @CurrentUser('id') userId: string,
        @Param('credentialId') credentialId: string,
        @Body() body: RenamePasskeyRequestDTO,
    ): Promise<PasskeyCredentialDTO> {
        return this.passkeyService.renameCredential(
            userId,
            credentialId,
            body.name,
        );
    }

    @Delete(':credentialId')
    @UseGuards(AuthGuard)
    @ApiSecurity('jwt')
    @NoBot()
    @ApiResponse({ status: 200, type: PasskeyDeleteResponseDTO })
    public async removePasskey(
        @CurrentUser('id') userId: string,
        @Param('credentialId') credentialId: string,
    ): Promise<PasskeyDeleteResponseDTO> {
        await this.passkeyService.removeCredential(userId, credentialId);
        return { message: 'Passkey removed' };
    }

    @Post('login/options')
    @Public()
    @NoBot()
    @HttpCode(HttpStatus.OK)
    @ApiResponse({ status: 200, type: PasskeyAuthenticationOptionsResponseDTO })
    public async startLogin(): Promise<PasskeyAuthenticationOptionsResponseDTO> {
        return this.passkeyService.generateAuthenticationOptions();
    }

    @Post('login/verify')
    @Public()
    @NoBot()
    @HttpCode(HttpStatus.OK)
    @ApiResponse({ status: 200, type: PasskeyLoginResponseDTO })
    @ApiResponse({ status: 401, description: 'Invalid credentials' })
    @ApiResponse({ status: 403, description: 'Account banned' })
    public async verifyLogin(
        @Body() body: PasskeyAuthenticationVerifyRequestDTO,
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<void> {
        const result = await this.passkeyService.verifyAuthentication(
            body.flowId,
            body.credential,
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
