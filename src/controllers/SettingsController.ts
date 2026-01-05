import {
    Controller,
    Get,
    Post,
    Body,
    Req,
    UseGuards,
    Inject,
    NotFoundException,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
} from '@nestjs/swagger';
import { injectable, inject } from 'inversify';
import { TYPES } from '@/di/types';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type { ILogger } from '@/di/interfaces/ILogger';
import type { Request as ExpressRequest } from 'express';
import { ErrorMessages } from '@/constants/errorMessages';
import { JWTPayload } from '@/utils/jwt';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { UpdateSettingsRequestDTO } from './dto/settings.request.dto';

interface UserSettings {
    muteNotifications?: boolean;
    useDiscordStyleMessages?: boolean;
    ownMessagesAlign?: 'left' | 'right';
    otherMessagesAlign?: 'left' | 'right';
    showYouLabel?: boolean;
    ownMessageColor?: string;
    otherMessageColor?: string;
}

// Controller for managing user-specific application settings
// Enforces JWT authentication
@injectable()
@Controller('api/v1/settings')
@ApiTags('Settings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SettingsController {
    constructor(
        @inject(TYPES.UserRepository)
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
        @inject(TYPES.Logger)
        @Inject(TYPES.Logger)
        private logger: ILogger,
    ) {}

    // Retrieves the current user's settings
    // Returns default values if no custom settings are configured
    @Get()
    @ApiOperation({ summary: 'Get user settings' })
    @ApiResponse({ status: 200, description: 'Settings retrieved' })
    @ApiResponse({
        status: 404,
        description: ErrorMessages.AUTH.USER_NOT_FOUND,
    })
    public async getSettings(
        @Req() req: ExpressRequest,
    ): Promise<UserSettings> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const user = await this.userRepo.findById(userId);

        if (!user) {
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        // Fallback to system default UI preferences if the user has not customized settings
        return (
            user.settings || {
                muteNotifications: false,
                useDiscordStyleMessages: false,
                ownMessagesAlign: 'right',
                otherMessagesAlign: 'left',
                showYouLabel: true,
                ownMessageColor: '#5865f2',
                otherMessageColor: '#2a2d31',
            }
        );
    }

    // Updates the current user's settings
    // Performs a partial update of the settings object
    @Post()
    @ApiOperation({ summary: 'Update user settings' })
    @ApiResponse({ status: 201, description: 'Settings updated' })
    @ApiResponse({
        status: 404,
        description: ErrorMessages.AUTH.USER_NOT_FOUND,
    })
    public async updateSettings(
        @Req() req: ExpressRequest,
        @Body() body: UpdateSettingsRequestDTO,
    ): Promise<{ message: string; settings: UserSettings }> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;

        const user = await this.userRepo.findById(userId);
        if (!user) {
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        // Perform a partial settings update
        await this.userRepo.updateSettings(userId, body);

        const updatedUser = await this.userRepo.findById(userId);
        const updatedSettings = updatedUser?.settings || {};

        return {
            message: 'Settings updated successfully',
            settings: updatedSettings,
        };
    }
}
