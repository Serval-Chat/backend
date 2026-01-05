import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { IsUserId, IsReason } from '@/validation/schemas/common';

export class KickMemberRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsReason()
    reason?: string;
}

export class BanMemberRequestDTO {
    @ApiProperty()
    @IsUserId()
    userId!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsReason()
    reason?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(7)
    deleteMessageDays?: number;
}

export class TransferOwnershipRequestDTO {
    @ApiProperty()
    @IsUserId()
    newOwnerId!: string;
}
