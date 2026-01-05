import {
    Controller,
    Get,
    Post,
    Route,
    Body,
    Security,
    Response,
    Tags,
    Request,
} from 'tsoa';
import { injectable, inject } from 'inversify';
import { TYPES } from '@/di/types';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type { ILogger } from '@/di/interfaces/ILogger';
import express from 'express';
import { ErrorResponse } from '@/controllers/models/ErrorResponse';
import { ErrorMessages } from '@/constants/errorMessages';
import { ApiError } from '@/utils/ApiError';
import { JWTPayload } from '@/utils/jwt';

interface UserSettings {
    muteNotifications?: boolean;
    useDiscordStyleMessages?: boolean;
    ownMessagesAlign?: 'left' | 'right';
    otherMessagesAlign?: 'left' | 'right';
    showYouLabel?: boolean;
    ownMessageColor?: string;
    otherMessageColor?: string;
}

interface UpdateSettingsRequest extends UserSettings { }

// Controller for managing user-specific application settings
// Enforces JWT authentication
@injectable()
@Route('api/v1/settings')
@Tags('Settings')
@Security('jwt')
export class SettingsController extends Controller {
    constructor(
        @inject(TYPES.UserRepository) private userRepo: IUserRepository,
        @inject(TYPES.Logger) private logger: ILogger,
    ) {
        super();
    }

    // Retrieves the current user's settings
    // Returns default values if no custom settings are configured
    @Get()
    @Response<ErrorResponse>('404', 'User Not Found', {
        error: ErrorMessages.AUTH.USER_NOT_FOUND,
    })
    public async getSettings(
        @Request() req: express.Request,
    ): Promise<UserSettings> {
        // @ts-ignore
        const userId = req.user.id;
        const user = await this.userRepo.findById(userId);

        if (!user) {
            throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
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
    @Response<ErrorResponse>('404', 'User Not Found', {
        error: ErrorMessages.AUTH.USER_NOT_FOUND,
    })
    public async updateSettings(
        @Request() req: express.Request,
        @Body() body: UpdateSettingsRequest,
    ): Promise<{ message: string; settings: UserSettings }> {
        // @ts-ignore
        const userId = req.user.id;

        const user = await this.userRepo.findById(userId);
        if (!user) {
            throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
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
