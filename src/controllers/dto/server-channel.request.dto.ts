import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsString,
    IsOptional,
    IsEnum,
    IsInt,
    IsArray,
    ValidateNested,
    MaxLength,
    IsMongoId,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsName, IsChannelId, IsCategoryId, IsUrlField, IsPermissionMap } from '@/validation/schemas/common';
import { ChannelTypeDTO } from './common.request.dto';


export class CreateChannelRequestDTO {
    @ApiProperty()
    @IsName()
    name!: string;

    @ApiPropertyOptional({ enum: ChannelTypeDTO })
    @IsOptional()
    @IsEnum(ChannelTypeDTO)
    type?: ChannelTypeDTO;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    position?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsMongoId()
    @IsCategoryId()
    categoryId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(200)
    description?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    icon?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUrlField()
    link?: string;

    @ApiPropertyOptional({
        description: 'Map of role/user IDs to permission overrides',
        example: { everyone: { sendMessages: true } },
    })
    @IsOptional()
    @IsPermissionMap()
    permissions?: Record<string, Record<string, boolean>>;
}

export class UpdateChannelRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsName()
    name?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    position?: number;

    @ApiPropertyOptional({ nullable: true, type: String })
    @IsOptional()
    @IsMongoId()
    @IsCategoryId()
    categoryId?: string | null;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(200)
    description?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    icon?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUrlField()
    link?: string;
}

export class ChannelPositionDTO {
    @ApiProperty()
    @IsMongoId()
    @IsChannelId()
    channelId!: string;

    @ApiProperty()
    @IsInt()
    position!: number;
}

export class ReorderChannelsRequestDTO {
    @ApiProperty({ type: [ChannelPositionDTO] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ChannelPositionDTO)
    channelPositions!: ChannelPositionDTO[];
}

export class CreateCategoryRequestDTO {
    @ApiProperty()
    @IsName()
    name!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    position?: number;
}

export class UpdateCategoryRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsName()
    name?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    position?: number;
}

export class CategoryPositionDTO {
    @ApiProperty()
    @IsMongoId()
    @IsCategoryId()
    categoryId!: string;

    @ApiProperty()
    @IsInt()
    position!: number;
}

export class ReorderCategoriesRequestDTO {
    @ApiProperty({ type: [CategoryPositionDTO] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CategoryPositionDTO)
    categoryPositions!: CategoryPositionDTO[];
}

export class UpdatePermissionsRequestDTO {
    @ApiProperty({
        description: 'Map of role/user IDs to permission overrides',
        example: { role_id: { sendMessages: true } },
    })
    @IsPermissionMap()
    permissions!: Record<string, Record<string, boolean>>;
}

