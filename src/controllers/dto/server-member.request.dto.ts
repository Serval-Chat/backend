import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max, IsMongoId } from 'class-validator';
import { IsUserId, IsReason } from '@/validation/schemas/common';

export class KickMemberRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsReason()
    reason?: string;
}

export class BanMemberRequestDTO {
    @ApiProperty()
    @IsMongoId()
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
    @IsMongoId()
    @IsUserId()
    newOwnerId!: string;
}
