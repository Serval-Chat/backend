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

export class GetBotTokenRequestDTO {
    @ApiProperty()
    @IsString()
    public client_id!: string;

    @ApiProperty()
    @IsString()
    public client_secret!: string;
}

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
