import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, IsIn, IsString, Min, Max } from 'class-validator';
import {
    IsUserId,
    IsReason,
    IsRoleId,
    IsLimit,
    IsOffset,
} from '@/validation/schemas/common';

export class KickMemberRequestDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsReason()
    public reason?: string;
}

export const BAN_DELETE_MESSAGE_DURATIONS = [
    '1h',
    '2h',
    '3h',
    '6h',
    '12h',
    '24h',
    '48h',
    '72h',
    'all',
] as const;

export type BanDeleteMessageDuration =
    (typeof BAN_DELETE_MESSAGE_DURATIONS)[number];

export function banDurationToHours(
    duration: BanDeleteMessageDuration,
): number | null {
    if (duration === 'all') return null;
    return parseInt(duration, 10);
}

export class BanMemberRequestDTO {
    @ApiProperty()
    @IsUserId()
    public userId!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsReason()
    public reason?: string;

    @ApiPropertyOptional({
        enum: BAN_DELETE_MESSAGE_DURATIONS,
        description:
            'Delete messages sent by this user in the specified time window. Omit to keep messages.',
    })
    @IsOptional()
    @IsIn(BAN_DELETE_MESSAGE_DURATIONS)
    public deleteMessageDuration?: BanDeleteMessageDuration;
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

export class ServerMemberAdminQueryDTO {
    /**
     * Number of items to return per page
     * @default 50
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
     * Filter by role ID
     */
    @ApiPropertyOptional()
    @IsOptional()
    @IsRoleId()
    public roleId?: string;

    /**
     * Search by username or display name
     */
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    public search?: string;

    /**
     * Field to sort by
     * @default joinedAt
     */
    @ApiPropertyOptional({ enum: ['joinedAt', 'username'] })
    @IsOptional()
    @IsIn(['joinedAt', 'username'])
    public sortBy?: 'joinedAt' | 'username';

    /**
     * Sort direction
     * @default desc
     */
    @ApiPropertyOptional({ enum: ['asc', 'desc'] })
    @IsOptional()
    @IsIn(['asc', 'desc'])
    public sortDir?: 'asc' | 'desc';
}
