import { ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsOptional,
    IsInt,
    IsPositive,
    IsString,
    Length,
    Matches,
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
    @Length(2, 18, {
        message: 'customPath must be between 2 and 18 characters',
    })
    @Matches(/^[A-Za-z0-9]+$/, {
        message: 'customPath must only contain letters (a-z, A-Z) and numbers',
    })
    public customPath?: string;
}
