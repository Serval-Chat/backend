import {
    Controller,
    Get,
    Post,
    Delete,
    Body,
    Param as Path,
    UseGuards,
    Res,
    NotFoundException,
    HttpCode,
    Inject,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
} from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { Permissions } from '@/modules/auth/permissions.decorator';
import { NoBot } from '@/modules/auth/bot.decorator';
import { RegistrationInviteService } from '@/services/RegistrationInviteService';
import { TYPES } from '@/di/types';
import {
    BatchCreateInvitesRequestDTO,
    InviteResponseDTO,
} from './dto/admin-invites.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@NoBot()
@Controller('api/v1/admin/invites')
export class AdminInviteController {
    public constructor(
        @Inject(TYPES.RegistrationInviteService)
        private inviteService: RegistrationInviteService,
    ) {}

    @Get()
    @Permissions('manageInvites')
    @ApiOperation({ summary: 'Lists all active invite tokens' })
    @ApiResponse({ status: 200, type: [String] })
    public listInvites(): string[] {
        return this.inviteService.listTokens();
    }

    @Post()
    @Permissions('manageInvites')
    @ApiOperation({ summary: 'Generates a new random invite token' })
    @ApiResponse({ status: 200, type: InviteResponseDTO })
    public createInvite(): InviteResponseDTO {
        const token = this.inviteService.createToken();
        return { message: 'Invite created', token };
    }

    @Delete(':token')
    @Permissions('manageInvites')
    @HttpCode(200)
    @ApiOperation({ summary: 'Deletes a specific invite token' })
    @ApiResponse({ status: 200, description: 'Invite deleted' })
    @ApiResponse({ status: 404, description: 'Token not found' })
    public deleteInvite(@Path('token') token: string): { message: string } {
        const deleted = this.inviteService.deleteToken(token);
        if (!deleted) {
            throw new NotFoundException('Token not found');
        }
        return { message: 'Invite deleted' };
    }

    @Post('batch')
    @Permissions('manageInvites')
    @ApiOperation({ summary: 'Batch generates new random invite tokens' })
    @ApiResponse({ status: 200, type: InviteResponseDTO })
    public batchCreateInvites(
        @Body() data: BatchCreateInvitesRequestDTO,
    ): InviteResponseDTO {
        const tokens = this.inviteService.batchCreateTokens(data.count);
        return {
            message: `${data.count} invites created`,
            tokens,
        };
    }

    @Get('export')
    @Permissions('manageInvites')
    @ApiOperation({ summary: 'Exports all active invite tokens as a file' })
    @ApiResponse({ status: 200, description: 'File download' })
    @ApiResponse({ status: 404, description: 'No tokens found' })
    public exportInvites(@Res() res: Response): void {
        const filePath = this.inviteService.getTokensFilePath();
        res.download(filePath, 'invites.txt');
    }
}
