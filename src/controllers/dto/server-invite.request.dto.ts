import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInviteRequestDTO {
    @ApiPropertyOptional()
    maxUses?: number;

    @ApiPropertyOptional({ description: 'Expiration time in seconds' })
    expiresIn?: number;

    @ApiPropertyOptional()
    customPath?: string;
}
