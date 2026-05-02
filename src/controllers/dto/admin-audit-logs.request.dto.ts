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
    public limit?: number;

    /**
     * Offset for pagination
     * @default 0
     */
    @ApiPropertyOptional()
    @IsOffset()
    public offset?: number;

    /**
     * Filter by actor ID
     */
    @ApiPropertyOptional()
    @IsOptional()
    @IsMongoId()
    @IsString()
    public actorId?: string;

    /**
     * Filter by action type
     */
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    public actionType?: string;

    /**
     * Filter by target user ID
     */
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @IsMongoId()
    public targetUserId?: string;

    /**
     * Filter logs after this date
     */
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    public startDate?: string;

    /**
     * Filter logs before this date
     */
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    public endDate?: string;
}
