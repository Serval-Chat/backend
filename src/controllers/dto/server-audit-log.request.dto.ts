import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { IsLimit, IsUserId } from '@/validation/schemas/common';

export class ServerAuditLogRequestDTO {
    /**
     * Number of items to return per page
     * @default 50
     */
    @ApiPropertyOptional()
    @IsLimit()
    public limit?: number;

    /**
     * Cursor for pagination (ObjectId string of last seen entry)
     */
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    public cursor?: string;

    /**
     * Filter by action type (e.g. 'user_ban', 'delete_channel')
     */
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    public action?: string;

    /**
     * Filter by moderator (actor) ID
     */
    @ApiPropertyOptional()
    @IsOptional()
    @IsUserId()
    public moderatorId?: string;

    /**
     * Filter by target ID (user, channel, role, or message)
     */
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    public targetId?: string;

    /**
     * Filter entries after this ISO date
     */
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    public after?: string;

    /**
     * Filter entries before this ISO date
     */
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    public before?: string;

    /**
     * Search reason field (substring match)
     */
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    public reason?: string;
}
