import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export enum AdminStatsRangeDTO {
    Day = '24h',
    Week = '7d',
    Month = '30d',
    All = 'all',
}

export class AdminStatsRequestDTO {
    @ApiPropertyOptional({ enum: AdminStatsRangeDTO })
    @IsOptional()
    @IsEnum(AdminStatsRangeDTO)
    public range?: AdminStatsRangeDTO;
}
