import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, IsPositive } from 'class-validator';

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
}
