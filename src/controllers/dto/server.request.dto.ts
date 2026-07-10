import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsString,
    IsOptional,
    IsBoolean,
    ValidateNested,
    IsEnum,
    ValidateIf,
    MinLength,
    IsArray,
    ArrayMaxSize,
    MaxLength,
    IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
    IsName,
    IsRoleId,
    IsColor,
    IsChannelId,
    IsCategoryId,
} from '@/validation/schemas/common';
import { ServerBannerTypeDTO } from './common.request.dto';

export class ServerBannerDTO {
    @ApiProperty({ enum: ServerBannerTypeDTO })
    @IsEnum(ServerBannerTypeDTO)
    public type!: ServerBannerTypeDTO;

    @ApiProperty()
    @ValidateIf((o) => o.type === ServerBannerTypeDTO.COLOR)
    @IsColor()
    @IsString()
    public value!: string;
}

export class CreateServerRequestDTO {
    @ApiProperty()
    @IsName()
    @MinLength(2, { message: 'Name must be at least 2 characters' })
    public name!: string;
}

export class MarkdownBlockadeRuleDTO {
    @ApiProperty({ enum: ['everyone', 'role', 'user'] })
    @IsIn(['everyone', 'role', 'user'])
    public targetType!: 'everyone' | 'role' | 'user';

    @ApiProperty()
    @IsString()
    public targetId!: string;

    @ApiProperty({ type: [String] })
    @IsArray()
    @IsString({ each: true })
    public features!: string[];
}

export class UpdateServerRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsName()
    public name?: string;

    @ApiPropertyOptional({ maxLength: 500 })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    public description?: string;

    @ApiPropertyOptional({ type: ServerBannerDTO })
    @IsOptional()
    @ValidateNested()
    @Type(() => ServerBannerDTO)
    public banner?: ServerBannerDTO;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public disableCustomFonts?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public disableUsernameGlowAndCustomColor?: boolean;

    @ApiPropertyOptional({ type: [MarkdownBlockadeRuleDTO] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MarkdownBlockadeRuleDTO)
    public markdownBlockadeRules?: MarkdownBlockadeRuleDTO[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public discoveryEnabled?: boolean;

    @ApiPropertyOptional({ nullable: true, type: String })
    @IsOptional()
    @IsRoleId()
    public defaultRoleId?: string | null;

    @ApiPropertyOptional({ type: [String] })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(8)
    @IsString({ each: true })
    @MaxLength(25, { each: true })
    public tags?: string[];
}

export class ServerOnboardingSettingsRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public enabled?: boolean;

    @ApiPropertyOptional({ type: [String] })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(20, { message: 'Maximum 20 guidelines allowed' })
    @IsString({ each: true })
    @MaxLength(500, {
        each: true,
        message: 'Each guideline must be 500 characters or less',
    })
    public guidelines?: string[];

    @ApiPropertyOptional({ type: [String] })
    @IsOptional()
    @IsArray()
    @IsRoleId({ each: true })
    public selfAssignableRoleIds?: string[];

    @ApiPropertyOptional({ nullable: true, type: String })
    @IsOptional()
    @IsChannelId()
    public landingChannelId?: string | null;

    @ApiPropertyOptional({ type: [String] })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(8)
    @IsChannelId({ each: true })
    public welcomeChannelIds?: string[];
}

export class SelfRolesRequestDTO {
    @ApiPropertyOptional({ type: [String] })
    @IsArray()
    @IsRoleId({ each: true })
    public roleIds!: string[];
}

export class ChannelPreferencesRequestDTO {
    @ApiPropertyOptional({ type: [String] })
    @IsArray()
    @IsChannelId({ each: true })
    public hiddenChannelIds!: string[];

    @ApiPropertyOptional({ type: [String] })
    @IsArray()
    @IsCategoryId({ each: true })
    public hiddenCategoryIds!: string[];
}

export class SetDefaultRoleRequestDTO {
    @ApiProperty({ nullable: true, type: String })
    @IsOptional()
    @IsRoleId()
    public roleId!: string | null;
}
