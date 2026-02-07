
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { IsLimit, IsOffset } from '@/validation/schemas/common';

export class AdminListAuditLogsRequestDTO {
    /**
     * Number of items to return
     * @default 100
     */
    @ApiPropertyOptional()
    @IsLimit()
    limit?: number;

    /**
     * Offset for pagination
     * @default 0
     */
    @ApiPropertyOptional()
    @IsOffset()
    offset?: number;

    /**
     * Filter by administrator ID
     */
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    adminId?: string;

    /**
     * Filter by action type
     */
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    actionType?: string;

    /**
     * Filter by target user ID
     */
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    targetUserId?: string;

    /**
     * Filter logs after this date
     */
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    startDate?: string;

    /**
     * Filter logs before this date
     */
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    endDate?: string;
}
