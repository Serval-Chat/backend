import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, IsNumber, IsArray, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRoleRequestDTO {
    @ApiProperty()
    @IsString()
    name!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    color?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    startColor?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    endColor?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    colors?: string[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
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
    @IsString()
    roleId!: string;

    @ApiProperty()
    @IsNumber()
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
    @IsString()
    name?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    color?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    startColor?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    endColor?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    colors?: string[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
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
    @IsNumber()
    position?: number;
}
