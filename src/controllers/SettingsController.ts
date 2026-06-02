import {
    Controller,
    Get,
    Post,
    Body,
    Req,
    UseGuards,
    Inject,
    NotFoundException,
    Patch,
} from '@nestjs/common';
import { Types } from 'mongoose';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiOkResponse,
    ApiBearerAuth,
} from '@nestjs/swagger';
import {
    UserSettingsResponseDTO,
    UpdateSettingsResponseDTO,
    UpdateServerSettingsResponseDTO,
} from './dto/settings.response.dto';
import { injectable } from 'inversify';
import { TYPES } from '@/di/types';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type { ILogger } from '@/di/interfaces/ILogger';
import type { Request as ExpressRequest } from 'express';
import { ErrorMessages } from '@/constants/errorMessages';
import { JWTPayload } from '@/utils/jwt';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { UpdateSettingsRequestDTO } from './dto/settings.request.dto';
import { UpdateServerSettingsRequestDTO } from './dto/server-settings.request.dto';
import type { WsServer } from '@/ws/server';

interface UserSettings {
    muteNotifications?: boolean;
    useDiscordStyleMessages?: boolean;
    ownMessagesAlign?: 'left' | 'right';
    otherMessagesAlign?: 'left' | 'right';
    showYouLabel?: boolean;
    ownMessageColor?: string;
    otherMessageColor?: string;
    disableCustomUsernameFonts?: boolean;
    disableCustomUsernameColors?: boolean;
    disableCustomUsernameGlow?: boolean;
    limitedAnimations?: boolean;
    customFontUrl?: string;
    customFontFamily?: string;
    notificationSounds?: {
        id: string;
        name: string;
        url: string;
        enabled: boolean;
    }[];
    useDefaultSounds?: boolean;
    use24HourTime?: boolean;
    keybinds?: Record<
        string,
        {
            code: string;
            ctrl?: boolean;
            alt?: boolean;
            shift?: boolean;
            meta?: boolean;
        } | null
    >;
    serverSettings?: {
        order: (
            | string
            | { id: string; name: string; color: string; serverIds: string[] }
        )[];
    };
}

@injectable()
@Controller('api/v1/settings')
@ApiTags('Settings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SettingsController {
    public constructor(
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
        @Inject(TYPES.Logger)
        private logger: ILogger,
        @Inject(TYPES.WsServer)
        private wsServer: WsServer,
    ) {}

    @Get()
    @ApiOperation({ summary: 'Get user settings' })
    @ApiOkResponse({
        type: UserSettingsResponseDTO,
        description: 'Settings retrieved',
    })
    @ApiResponse({
        status: 404,
        description: ErrorMessages.AUTH.USER_NOT_FOUND,
    })
    public async getSettings(
        @Req() req: ExpressRequest,
    ): Promise<UserSettings> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const userOid = new Types.ObjectId(userId);
        const user = await this.userRepo.findById(userOid);

        if (user === null) {
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        const settings: UserSettings = user.settings || {
            muteNotifications: false,
            useDiscordStyleMessages: false,
            ownMessagesAlign: 'right',
            otherMessagesAlign: 'left',
            showYouLabel: true,
            ownMessageColor: '#5865f2',
            otherMessageColor: '#2a2d31',
            disableCustomUsernameFonts: false,
            disableCustomUsernameColors: false,
            disableCustomUsernameGlow: false,
            limitedAnimations: false,
            customFontUrl: '',
            customFontFamily: '',
            keybinds: {},
        };

        if (user.serverSettings) {
            settings.serverSettings = user.serverSettings;
        }

        return settings;
    }

    @Post()
    @ApiOperation({ summary: 'Update user settings' })
    @ApiResponse({
        status: 201,
        type: UpdateSettingsResponseDTO,
        description: 'Settings updated',
    })
    @ApiResponse({
        status: 404,
        description: ErrorMessages.AUTH.USER_NOT_FOUND,
    })
    public async updateSettings(
        @Req() req: ExpressRequest,
        @Body() body: UpdateSettingsRequestDTO,
    ): Promise<{ message: string; settings: UserSettings }> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const userOid = new Types.ObjectId(userId);

        const user = await this.userRepo.findById(userOid);
        if (user === null) {
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        // Perform a partial settings update
        await this.userRepo.updateSettings(userOid, body);

        const updatedUser = await this.userRepo.findById(userOid);
        const updatedSettings = updatedUser?.settings || {};

        try {
            this.wsServer.broadcastToUser(userId, {
                type: 'user_updated',
                payload: { userId, settings: updatedSettings },
            });
        } catch (err) {
            this.logger.error('Failed to broadcast settings update:', err);
        }

        return {
            message: 'Settings updated successfully',
            settings: updatedSettings,
        };
    }

    @Patch('server-settings')
    @ApiOperation({ summary: 'Update server settings (order and folders)' })
    @ApiOkResponse({
        type: UpdateServerSettingsResponseDTO,
        description: 'Server settings updated',
    })
    public async updateServerSettings(
        @Req() req: ExpressRequest,
        @Body() body: UpdateServerSettingsRequestDTO,
    ): Promise<{
        message: string;
        serverSettings: {
            order: (
                | string
                | {
                      id: string;
                      name: string;
                      color: string;
                      serverIds: string[];
                  }
            )[];
        };
    }> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const userOid = new Types.ObjectId(userId);

        await this.userRepo.update(userOid, {
            serverSettings: { order: body.order },
        });

        try {
            this.wsServer.broadcastToUser(userId, {
                type: 'user_updated',
                payload: {
                    userId,
                    serverSettings: { order: body.order },
                },
            });
        } catch (err) {
            this.logger.error(
                'Failed to broadcast server settings update:',
                err,
            );
        }

        return {
            message: 'Server settings updated successfully',
            serverSettings: { order: body.order },
        };
    }
}
