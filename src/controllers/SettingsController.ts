import {
    Controller,
    Get,
    Post,
    Put,
    Body,
    UseGuards,
    Inject,
    NotFoundException,
    Patch,
} from '@nestjs/common';
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
import {
    FrequentlyUsedEmojisResponseDTO,
    UpdateFrequentlyUsedEmojisRequestDTO,
    UpdateFrequentlyUsedEmojisResponseDTO,
} from './dto/frequently-used-emoji.dto';
import { TYPES } from '@/di/types';
import type {
    IUserRepository,
    FrequentlyUsedEmojiEntry,
} from '@/di/interfaces/IUserRepository';
import type { ILogger } from '@/di/interfaces/ILogger';
import { ErrorMessages } from '@/constants/errorMessages';
import { CurrentUser } from '@/modules/auth/current-user.decorator';
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
    showUsersPronouns?: boolean;
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
        @CurrentUser('id') userId: string,
    ): Promise<UserSettings> {
        const user = await this.userRepo.findById(userId);

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
            showUsersPronouns: false,
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
        @CurrentUser('id') userId: string,
        @Body() body: UpdateSettingsRequestDTO,
    ): Promise<{ message: string; settings: UserSettings }> {
        const user = await this.userRepo.findById(userId);
        if (user === null) {
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        // Perform a partial settings update
        await this.userRepo.updateSettings(userId, body);

        const updatedUser = await this.userRepo.findById(userId);
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
        @CurrentUser('id') userId: string,
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
        await this.userRepo.update(userId, {
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

    @Get('frequently-used-emojis')
    @ApiOperation({ summary: 'Get frequently used emojis' })
    @ApiOkResponse({
        type: FrequentlyUsedEmojisResponseDTO,
        description: 'Frequently used emojis retrieved',
    })
    @ApiResponse({
        status: 404,
        description: ErrorMessages.AUTH.USER_NOT_FOUND,
    })
    public async getFrequentlyUsedEmojis(
        @CurrentUser('id') userId: string,
    ): Promise<{ emojis: FrequentlyUsedEmojiEntry[] }> {
        const user = await this.userRepo.findById(userId);
        if (user === null) {
            throw new NotFoundException(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        return { emojis: user.frequentlyUsedEmojis ?? [] };
    }

    @Put('frequently-used-emojis')
    @ApiOperation({
        summary:
            'Replace the frequently used emoji list (full sync from client)',
    })
    @ApiOkResponse({
        type: UpdateFrequentlyUsedEmojisResponseDTO,
        description: 'Frequently used emojis updated',
    })
    public async updateFrequentlyUsedEmojis(
        @CurrentUser('id') userId: string,
        @Body() body: UpdateFrequentlyUsedEmojisRequestDTO,
    ): Promise<{ message: string; emojis: FrequentlyUsedEmojiEntry[] }> {
        const emojis: FrequentlyUsedEmojiEntry[] = body.emojis.map((e) => ({
            emoji: e.emoji,
            emojiType: e.emojiType,
            emojiId: e.emojiId,
            count: e.count,
            lastUsedAt: new Date(e.lastUsedAt),
        }));

        await this.userRepo.updateFrequentlyUsedEmojis(userId, emojis);

        try {
            this.wsServer.broadcastToUser(userId, {
                type: 'user_updated',
                payload: { userId, frequentlyUsedEmojis: emojis },
            });
        } catch (err) {
            this.logger.error(
                'Failed to broadcast frequently used emojis update:',
                err,
            );
        }

        return {
            message: 'Frequently used emojis updated successfully',
            emojis,
        };
    }
}
