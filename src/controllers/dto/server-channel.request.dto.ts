import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsString,
    IsOptional,
    IsEnum,
    IsInt,
    IsArray,
    ValidateNested,
    MaxLength,
    Min,
    Max,
    IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
    IsName,
    IsChannelId,
    IsCategoryId,
    IsUrlField,
    IsPermissionMap,
} from '@/validation/schemas/common';
import { ChannelTypeDTO } from './common.request.dto';
import type { Permissions } from '@/permissions/types';

export class PermissionOverridesMapDTO {
    [key: string]: Permissions;
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

export class CreateChannelRequestDTO {
    @ApiProperty()
    @IsName()
    public name!: string;

    @ApiPropertyOptional({ enum: ChannelTypeDTO })
    @IsOptional()
    @IsEnum(ChannelTypeDTO)
    public type?: ChannelTypeDTO;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    public position?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsCategoryId()
    public categoryId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(200)
    public description?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    public icon?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    public emoji?: string;

    @ApiPropertyOptional({ enum: ['custom', 'unicode'] })
    @IsOptional()
    @IsEnum(['custom', 'unicode'])
    public emojiType?: 'custom' | 'unicode';

    @ApiPropertyOptional()
    @IsOptional()
    @IsUrlField()
    public link?: string;
    @ApiPropertyOptional({
        description: 'Cooldown between messages in seconds',
        minimum: 0,
        maximum: 21600,
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(21600)
    public slowMode?: number;

    @ApiPropertyOptional({
        description: 'Map of role/user IDs to permission overrides',
        example: { everyone: { sendMessages: true } },
    })
    @IsOptional()
    @IsPermissionMap()
    public permissions?: PermissionOverridesMapDTO;

    @ApiPropertyOptional({ type: [MarkdownBlockadeRuleDTO] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MarkdownBlockadeRuleDTO)
    public markdownBlockadeRules?: MarkdownBlockadeRuleDTO[];
}

export class UpdateChannelRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsName()
    public name?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    public position?: number;

    @ApiPropertyOptional({ nullable: true, type: String })
    @IsOptional()
    @IsCategoryId()
    public categoryId?: string | null;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(200)
    public description?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    public icon?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    public emoji?: string;

    @ApiPropertyOptional({ enum: ['custom', 'unicode'] })
    @IsOptional()
    @IsEnum(['custom', 'unicode'])
    public emojiType?: 'custom' | 'unicode';

    @ApiPropertyOptional()
    @IsOptional()
    @IsUrlField()
    public link?: string;
    @ApiPropertyOptional({
        description: 'Cooldown between messages in seconds',
        minimum: 0,
        maximum: 21600,
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(21600)
    public slowMode?: number;

    @ApiPropertyOptional({ type: [MarkdownBlockadeRuleDTO] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MarkdownBlockadeRuleDTO)
    public markdownBlockadeRules?: MarkdownBlockadeRuleDTO[];
}

export class ChannelPositionDTO {
    @ApiProperty()
    @IsChannelId()
    public channelId!: string;

    @ApiProperty()
    @IsInt()
    public position!: number;
}

export class ReorderChannelsRequestDTO {
    @ApiProperty({ type: [ChannelPositionDTO] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ChannelPositionDTO)
    public channelPositions!: ChannelPositionDTO[];
}

export class CreateCategoryRequestDTO {
    @ApiProperty()
    @IsName()
    public name!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    public position?: number;

    @ApiPropertyOptional({ type: [MarkdownBlockadeRuleDTO] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MarkdownBlockadeRuleDTO)
    public markdownBlockadeRules?: MarkdownBlockadeRuleDTO[];
}

export class UpdateCategoryRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsName()
    public name?: string;

    @ApiPropertyOptional({ type: [MarkdownBlockadeRuleDTO] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MarkdownBlockadeRuleDTO)
    public markdownBlockadeRules?: MarkdownBlockadeRuleDTO[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    public position?: number;
}

export class CategoryPositionDTO {
    @ApiProperty()
    @IsCategoryId()
    public categoryId!: string;

    @ApiProperty()
    @IsInt()
    public position!: number;
}

export class ReorderCategoriesRequestDTO {
    @ApiProperty({ type: [CategoryPositionDTO] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CategoryPositionDTO)
    public categoryPositions!: CategoryPositionDTO[];
}

export class UpdatePermissionsRequestDTO {
    @ApiProperty({
        description: 'Map of role/user IDs to permission overrides',
        example: { role_id: { sendMessages: true } },
    })
    @IsPermissionMap()
    public permissions!: PermissionOverridesMapDTO;
}
