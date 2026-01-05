import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsString,
    IsOptional,
    IsEnum,
    IsInt,
    IsArray,
    ValidateNested,
    IsObject,
    MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsName, IsChannelId, IsCategoryId } from '@/validation/schemas/common';
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
    @IsCategoryId()
    categoryId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(200)
    description?: string;
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
    @IsCategoryId()
    categoryId?: string | null;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(200)
    description?: string;
}

export class ChannelPositionDTO {
    @ApiProperty()
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
    @IsObject()
    permissions!: Record<string, Record<string, boolean>>;
}
