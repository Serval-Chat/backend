import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmojiResponseDTO } from './emoji.response.dto';

export class VoiceStatesMapDTO {
    [key: string]: string[];
}

export class ServerUnreadDTO {
    @ApiProperty()
    public serverId!: string;

    @ApiProperty()
    public hasUnread!: boolean;

    @ApiPropertyOptional({ type: [String] })
    public unreadChannelIds?: string[];
}

export class ServerUnreadStatusResponseDTO {
    @ApiProperty({ type: [ServerUnreadDTO] })
    public servers!: ServerUnreadDTO[];
}

export class ServerCreateResponseDTO {
    @ApiProperty()
    public id!: string;

    @ApiProperty()
    public name!: string;

    @ApiProperty()
    public ownerId!: string;

    @ApiPropertyOptional()
    public icon?: string;

    @ApiPropertyOptional()
    public description?: string;

    @ApiPropertyOptional()
    public defaultRoleId?: string;

    @ApiPropertyOptional()
    public createdAt?: string;
}

export class OnboardingSettingsResponseDTO {
    @ApiPropertyOptional({ type: [String] })
    public requiredRoleIds?: string[];

    @ApiPropertyOptional({ type: [String] })
    public selfRoleIds?: string[];

    @ApiPropertyOptional()
    public rulesContent?: string;

    @ApiPropertyOptional()
    public enabled?: boolean;
}

export class ServerEmojisListResponseDTO {
    @ApiProperty({ type: [EmojiResponseDTO] })
    public emojis!: EmojiResponseDTO[];
}

export class ServerMarkReadResponseDTO {
    @ApiProperty()
    public message!: string;
}

export class ServerDeleteResponseDTO {
    @ApiProperty()
    public message!: string;
}

export class ServerVerificationResponseDTO {
    @ApiProperty()
    public message!: string;

    @ApiPropertyOptional()
    public verificationId?: string;
}

export class VoiceStatesResponseDTO {
    @ApiProperty({ type: VoiceStatesMapDTO })
    public states!: VoiceStatesMapDTO;
}
