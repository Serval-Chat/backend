import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsString,
    IsOptional,
    IsBoolean,
    ValidateNested,
    IsArray,
    MaxLength,
} from 'class-validator';
import { MAX_MESSAGE_LENGTH } from '@/config/env';
import { Type } from 'class-transformer';
import { SlashCommandOptionDTO } from './application.request.dto';

export class CreateBotRequestDTO {
    @ApiProperty()
    @IsString()
    @MaxLength(32)
    public name!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(MAX_MESSAGE_LENGTH)
    public description?: string;
}

export class UpdateBotRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(32)
    public name?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(MAX_MESSAGE_LENGTH)
    public description?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(7)
    public bannerColor?: string;
}

export class UpdateBotPermissionsRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public readMessages?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public sendMessages?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public manageMessages?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public readUsers?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public joinServers?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public manageServer?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public manageChannels?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public manageMembers?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public readReactions?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public addReactions?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public viewChannels?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public connect?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public deleteMessagesOfOthers?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public manageRoles?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public banMembers?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public kickMembers?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public manageInvites?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public administrator?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public manageWebhooks?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public pingRolesAndEveryone?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public manageReactions?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public exportChannelMessages?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public bypassSlowmode?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public pinMessages?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public seeDeletedMessages?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public moderateMembers?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public manageStickers?: boolean;
}

export class AuthorizeBotRequestDTO {
    @ApiProperty()
    @IsString()
    public serverId!: string;

    @ApiPropertyOptional()
    @IsOptional()
    public permissions?: number;
}

export class BotCommandDTO {
    @ApiProperty()
    @IsString()
    @MaxLength(32)
    public name!: string;

    @ApiProperty()
    @IsString()
    @MaxLength(100)
    public description!: string;

    @ApiPropertyOptional({ type: () => [SlashCommandOptionDTO] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SlashCommandOptionDTO)
    public options?: SlashCommandOptionDTO[];
}

export class UpdateBotCommandsRequestDTO {
    @ApiProperty({ type: () => [BotCommandDTO] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BotCommandDTO)
    public commands!: BotCommandDTO[];
}
