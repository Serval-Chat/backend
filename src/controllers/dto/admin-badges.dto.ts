import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsHexColor } from 'class-validator';

export class CreateBadgeRequestDTO {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    public id!: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    public name!: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    public description!: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    public icon!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsHexColor()
    public color?: string;
}

export class UpdateBadgeRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    public name?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    public description?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    public icon?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsHexColor()
    public color?: string;
}

export class BadgeResponseDTO {
    @ApiProperty()
    public id!: string;

    @ApiProperty()
    public name!: string;

    @ApiProperty()
    public description!: string;

    @ApiProperty()
    public icon!: string;

    @ApiProperty()
    public color!: string;

    @ApiProperty()
    public createdAt!: Date;
}
