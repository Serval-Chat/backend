import { ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsOptional,
    IsInt,
    IsPositive,
    IsString,
    MaxLength,
} from 'class-validator';

export class CreateInviteRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @IsPositive()
    public maxUses?: number;

    @ApiPropertyOptional({ description: 'Expiration time in seconds' })
    @IsOptional()
    @IsInt()
    @IsPositive()
    public expiresIn?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(50)
    public customPath?: string;
}
