import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { IsUserId, IsReason } from '@/validation/schemas/common';

export class KickMemberRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsReason()
    public reason?: string;
}

export class BanMemberRequestDTO {
    @ApiProperty()
    @IsUserId()
    public userId!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsReason()
    public reason?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(7)
    public deleteMessageDays?: number;
}

export class TransferOwnershipRequestDTO {
    @ApiProperty()
    @IsUserId()
    public newOwnerId!: string;
}

export class TimeoutMemberRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(2419200) // 28 days in seconds
    public duration?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsReason()
    public reason?: string;
}
