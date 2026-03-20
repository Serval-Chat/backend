import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString } from 'class-validator';
import { IsLimit } from '@/validation/schemas/common';

export class ServerAuditLogRequestDTO {
    /**
     * Number of items to return per page
     * @default 50
     */
    @ApiPropertyOptional()
    @IsLimit()
    limit?: number;

    /**
     * Cursor for pagination (ObjectId string of last seen entry)
     */
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    cursor?: string;

    /**
     * Filter by action type (e.g. 'user_ban', 'delete_channel')
     */
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    action?: string;

    /**
     * Filter by moderator (actor) ID
     */
    @ApiPropertyOptional()
    @IsOptional()
    @IsMongoId()
    @IsString()
    moderatorId?: string;

    /**
     * Filter by target ID (user, channel, role, or message)
     */
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    targetId?: string;

    /**
     * Filter entries after this ISO date
     */
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    after?: string;

    /**
     * Filter entries before this ISO date
     */
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    before?: string;

    /**
     * Search reason field (substring match)
     */
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    reason?: string;
}
