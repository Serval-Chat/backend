import {
    Controller,
    Post,
    Param,
    Req,
    UseGuards,
    Inject,
} from '@nestjs/common';
import { ApiTags, ApiSecurity, ApiResponse } from '@nestjs/swagger';
import { TYPES } from '@/di/types';
import { AuthGuard } from '@/modules/auth/auth.module';
import { NoBot } from '@/modules/auth/bot.decorator';
import { Permissions } from '@/modules/auth/permissions.decorator';
import type { AuthenticatedRequest } from '@/middleware/auth';
import { PasswordlessService } from '@/services/PasswordlessService';
import { AdminPasswordlessResetResponseDTO } from './dto/passwordless.response.dto';

@ApiTags('Admin')
@UseGuards(AuthGuard)
@NoBot()
@Controller('api/v1/admin/passwordless')
export class AdminPasswordlessController {
    public constructor(
        @Inject(TYPES.PasswordlessService)
        private passwordlessService: PasswordlessService,
    ) {}

    @Post('users/:userId/reset')
    @Permissions('manageUsers')
    @ApiSecurity('jwt')
    @ApiResponse({ status: 200, type: AdminPasswordlessResetResponseDTO })
    @ApiResponse({ status: 404, description: 'User not found' })
    public async reset(
        @Param('userId') userId: string,
        @Req() req: AuthenticatedRequest,
    ): Promise<AdminPasswordlessResetResponseDTO> {
        const temporaryPassword = await this.passwordlessService.adminReset(
            req.user.id,
            userId,
        );

        return {
            message:
                'Passwordless disabled; a temporary password was set. Relay it to the user out-of-band and have them change it immediately.',
            temporaryPassword,
        };
    }
}
