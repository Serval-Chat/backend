import {
    ApiProperty,
    ApiPropertyOptional,
    ApiExtraModels,
    getSchemaPath,
} from '@nestjs/swagger';

export class KeybindsResponseMapDTO {
    [key: string]: KeybindDTO | null;
}

export class ServerSettingFolderDTO {
    @ApiProperty()
    public id!: string;

    @ApiProperty()
    public name!: string;

    @ApiProperty()
    public color!: string;

    @ApiProperty({ type: [String] })
    public serverIds!: string[];
}

export class NotificationSoundDTO {
    @ApiProperty()
    public id!: string;

    @ApiProperty()
    public name!: string;

    @ApiProperty()
    public url!: string;

    @ApiProperty()
    public enabled!: boolean;
}

export class KeybindDTO {
    @ApiProperty()
    public code!: string;

    @ApiPropertyOptional()
    public ctrl?: boolean;

    @ApiPropertyOptional()
    public alt?: boolean;

    @ApiPropertyOptional()
    public shift?: boolean;

    @ApiPropertyOptional()
    public meta?: boolean;
}

@ApiExtraModels(ServerSettingFolderDTO)
export class ServerSettingsDTO {
    @ApiProperty({
        type: 'array',
        items: {
            oneOf: [
                { type: 'string' },
                { $ref: getSchemaPath(ServerSettingFolderDTO) },
            ],
        },
    })
    public order!: (string | ServerSettingFolderDTO)[];
}

export class UserSettingsResponseDTO {
    @ApiPropertyOptional()
    public muteNotifications?: boolean;

    @ApiPropertyOptional()
    public useDiscordStyleMessages?: boolean;

    @ApiPropertyOptional({ enum: ['left', 'right'] })
    public ownMessagesAlign?: 'left' | 'right';

    @ApiPropertyOptional({ enum: ['left', 'right'] })
    public otherMessagesAlign?: 'left' | 'right';

    @ApiPropertyOptional()
    public showYouLabel?: boolean;

    @ApiPropertyOptional()
    public ownMessageColor?: string;

    @ApiPropertyOptional()
    public otherMessageColor?: string;

    @ApiPropertyOptional()
    public disableCustomUsernameFonts?: boolean;

    @ApiPropertyOptional()
    public disableCustomUsernameColors?: boolean;

    @ApiPropertyOptional()
    public disableCustomUsernameGlow?: boolean;

    @ApiPropertyOptional()
    public limitedAnimations?: boolean;

    @ApiPropertyOptional()
    public showUsersPronouns?: boolean;

    @ApiPropertyOptional()
    public customFontUrl?: string;

    @ApiPropertyOptional()
    public customFontFamily?: string;

    @ApiPropertyOptional({ type: [NotificationSoundDTO] })
    public notificationSounds?: NotificationSoundDTO[];

    @ApiPropertyOptional()
    public useDefaultSounds?: boolean;

    @ApiPropertyOptional()
    public use24HourTime?: boolean;

    @ApiPropertyOptional({ type: KeybindsResponseMapDTO })
    public keybinds?: KeybindsResponseMapDTO;

    @ApiPropertyOptional({ type: ServerSettingsDTO })
    public serverSettings?: ServerSettingsDTO;
}

export class UpdateSettingsResponseDTO {
    @ApiProperty()
    public message!: string;

    @ApiProperty({ type: UserSettingsResponseDTO })
    public settings!: UserSettingsResponseDTO;
}

export class UpdateServerSettingsResponseDTO {
    @ApiProperty()
    public message!: string;

    @ApiProperty({ type: ServerSettingsDTO })
    public serverSettings!: ServerSettingsDTO;
}
