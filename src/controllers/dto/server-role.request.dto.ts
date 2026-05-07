import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsOptional,
    IsBoolean,
    IsArray,
    ValidateNested,
    IsInt,
    Min,
    Max,
    ArrayMaxSize,
    IsMongoId,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
    IsName,
    IsColor,
    IsRoleId,
    IsPermissions,
} from '@/validation/schemas/common';

export class CreateRoleRequestDTO {
    @ApiProperty()
    @IsName()
    public name!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsColor()
    public color?: string;

    @ApiPropertyOptional({
        deprecated: true,
        description: 'Use colors array instead',
    })
    @IsOptional()
    @IsColor()
    public startColor?: string;

    @ApiPropertyOptional({
        deprecated: true,
        description: 'Use colors array instead',
    })
    @IsOptional()
    @IsColor()
    public endColor?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(15)
    @IsColor({ each: true })
    public colors?: string[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(10)
    public gradientRepeat?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public separateFromOtherRoles?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsPermissions()
    public permissions?: Record<string, boolean>;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public glowEnabled?: boolean;
}

export class RolePositionDTO {
    @ApiProperty()
    @IsMongoId()
    @IsRoleId()
    public roleId!: string;

    @ApiProperty()
    @IsInt()
    public position!: number;
}

export class ReorderRolesRequestDTO {
    @ApiProperty({ type: [RolePositionDTO] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RolePositionDTO)
    public rolePositions!: RolePositionDTO[];
}

export class UpdateRoleRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsName()
    public name?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsColor()
    public color?: string;

    @ApiPropertyOptional({
        deprecated: true,
        description: 'Use colors array instead',
    })
    @IsOptional()
    @IsColor()
    public startColor?: string;

    @ApiPropertyOptional({
        deprecated: true,
        description: 'Use colors array instead',
    })
    @IsOptional()
    @IsColor()
    public endColor?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(15)
    @IsColor({ each: true })
    public colors?: string[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(10)
    public gradientRepeat?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public separateFromOtherRoles?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsPermissions()
    public permissions?: Record<string, boolean>;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    public position?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    public glowEnabled?: boolean;
}
