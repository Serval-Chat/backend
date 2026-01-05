import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, IsNumber, IsArray, IsObject, ValidateNested, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { IsName, IsColor, IsRoleId } from '@/validation/schemas/common';

export class CreateRoleRequestDTO {
    @ApiProperty()
    @IsName()
    name!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsColor()
    color?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsColor()
    startColor?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsColor()
    endColor?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsArray()
    @IsColor({ each: true })
    colors?: string[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(10)
    gradientRepeat?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    separateFromOtherRoles?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsObject()
    permissions?: Record<string, boolean>;
}

export class RolePositionDTO {
    @ApiProperty()
    @IsRoleId()
    roleId!: string;

    @ApiProperty()
    @IsInt()
    position!: number;
}

export class ReorderRolesRequestDTO {
    @ApiProperty({ type: [RolePositionDTO] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RolePositionDTO)
    rolePositions!: RolePositionDTO[];
}

export class UpdateRoleRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsName()
    name?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsColor()
    color?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsColor()
    startColor?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsColor()
    endColor?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsArray()
    @IsColor({ each: true })
    colors?: string[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(10)
    gradientRepeat?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    separateFromOtherRoles?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsObject()
    permissions?: Record<string, boolean>;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    position?: number;
}
