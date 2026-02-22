import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString } from 'class-validator';
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
     * Filter by actor ID
     */
    @ApiPropertyOptional()
    @IsOptional()
    @IsMongoId()
    @IsString()
    actorId?: string;

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
    @IsMongoId()
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
