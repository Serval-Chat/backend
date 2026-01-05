import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, IsPositive, IsString, MaxLength } from 'class-validator';

export class CreateInviteRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @IsPositive()
    maxUses?: number;

    @ApiPropertyOptional({ description: 'Expiration time in seconds' })
    @IsOptional()
    @IsInt()
    @IsPositive()
    expiresIn?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(50)
    customPath?: string;
}
