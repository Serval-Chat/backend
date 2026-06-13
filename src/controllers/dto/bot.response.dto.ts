import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BotUserDTO {
    @ApiProperty()
    public id!: string;

    @ApiProperty()
    public username!: string;

    @ApiPropertyOptional()
    public displayName?: string;

    @ApiPropertyOptional()
    public bio?: string;

    @ApiPropertyOptional()
    public profilePicture?: string;

    @ApiPropertyOptional()
    public banner?: string;

    @ApiPropertyOptional()
    public bannerColor?: string;

    @ApiProperty()
    public isBot!: boolean;

    @ApiPropertyOptional()
    public createdAt?: string;
}

export class BotPermissionsDTO {
    @ApiProperty()
    public joinServers!: boolean;

    @ApiProperty()
    public sendMessages!: boolean;

    @ApiProperty()
    public readMessages!: boolean;
}

export class BotResponseDTO {
    @ApiProperty()
    public id!: string;

    @ApiProperty()
    public clientId!: string;

    @ApiProperty()
    public ownerId!: string;

    @ApiProperty({ type: BotUserDTO })
    public userId!: BotUserDTO;

    @ApiProperty({ type: BotPermissionsDTO })
    public botPermissions!: BotPermissionsDTO;

    @ApiPropertyOptional()
    public createdAt?: string;
}

export class CreateBotResponseDTO {
    @ApiProperty({ type: BotResponseDTO })
    public bot!: BotResponseDTO;

    @ApiProperty()
    public token!: string;
}

export class BotTokenResponseDTO {
    @ApiProperty()
    public token!: string;
}

export class BotDeleteResponseDTO {
    @ApiProperty()
    public message!: string;
}

export class BotPublicInfoResponseDTO {
    @ApiProperty()
    public clientId!: string;

    @ApiProperty()
    public username!: string;

    @ApiPropertyOptional()
    public displayName?: string;

    @ApiPropertyOptional()
    public bio?: string;

    @ApiPropertyOptional()
    public profilePicture?: string;

    @ApiPropertyOptional()
    public banner?: string;

    @ApiPropertyOptional()
    public usernameGradient?: string;

    @ApiProperty({ type: BotPermissionsDTO })
    public botPermissions!: BotPermissionsDTO;

    @ApiProperty()
    public serverCount!: number;
}

export class BotServerCountResponseDTO {
    @ApiProperty()
    public count!: number;
}

export class BotAuthorizeResponseDTO {
    @ApiProperty()
    public serverId!: string;

    @ApiProperty()
    public serverName!: string;
}

export class SlashCommandOptionDTO {
    @ApiProperty()
    public name!: string;

    @ApiProperty()
    public description!: string;

    @ApiPropertyOptional()
    public type?: number;
}

export class SlashCommandDTO {
    @ApiProperty()
    public id!: string;

    @ApiProperty()
    public botId!: string;

    @ApiProperty()
    public name!: string;

    @ApiProperty()
    public description!: string;

    @ApiProperty({ type: [SlashCommandOptionDTO] })
    public options!: SlashCommandOptionDTO[];
}

export class BotUploadPictureResponseDTO {
    @ApiProperty()
    public profilePicture!: string;
}

export class BotUploadBannerResponseDTO {
    @ApiProperty()
    public banner!: string;
}
