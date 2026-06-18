import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsString,
    IsOptional,
    IsArray,
    MinLength,
    MaxLength,
    IsBoolean,
    IsIn,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { IsUserId, IsLimit, IsOffset } from '@/validation/schemas/common';

/** Shared filter fields for both DM and channel search DTOs. */
abstract class BaseMessageSearchQueryDTO {
    @ApiPropertyOptional({
        description: 'Free-text search query (fuzzy)',
        default: '',
    })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : ''))
    public q: string = '';

    @ApiPropertyOptional({ default: 25 })
    @IsLimit()
    public limit: number = 25;

    @ApiPropertyOptional({ default: 0 })
    @IsOffset()
    public offset: number = 0;

    @ApiPropertyOptional({
        description:
            'Filter by sender username (resolved to userId server-side)',
    })
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    @Transform(({ value }) =>
        typeof value === 'string' ? value.trim() || undefined : undefined,
    )
    public fromUser?: string;

    @ApiPropertyOptional({
        description:
            'Filter by mentioned username (resolved to userId server-side)',
    })
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    @Transform(({ value }) =>
        typeof value === 'string' ? value.trim() || undefined : undefined,
    )
    public mentionsUser?: string;

    @ApiPropertyOptional({
        description: 'Filter by author type',
        enum: ['user', 'bot', 'webhook'],
    })
    @IsOptional()
    @IsIn(['user', 'bot', 'webhook'])
    public authorType?: 'user' | 'bot' | 'webhook';

    @ApiPropertyOptional({
        description: 'Filter messages that have a file attachment',
    })
    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === 'true' || value === true)
    public hasFile?: boolean;

    @ApiPropertyOptional({ description: 'Filter messages that have an embed' })
    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === 'true' || value === true)
    public hasEmbed?: boolean;

    @ApiPropertyOptional({ description: 'Filter messages that contain a link' })
    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === 'true' || value === true)
    public hasLink?: boolean;

    @ApiPropertyOptional({
        description: 'Return only messages created before this ISO date',
    })
    @IsOptional()
    @IsString()
    @MaxLength(32)
    public before?: string;

    @ApiPropertyOptional({
        description: 'Return only messages created after this ISO date',
    })
    @IsOptional()
    @IsString()
    @MaxLength(32)
    public after?: string;

    @ApiPropertyOptional({
        description: 'Exact phrase match (no fuzziness), additive with q',
    })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    @Transform(({ value }) =>
        typeof value === 'string' ? value.trim() || undefined : undefined,
    )
    public strict?: string;

    // negated variants
    @ApiPropertyOptional({ description: 'Exclude messages from this username' })
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    @Transform(({ value }) =>
        typeof value === 'string' ? value.trim() || undefined : undefined,
    )
    public notFromUser?: string;

    @ApiPropertyOptional({
        description: 'Exclude messages that mention this username',
    })
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    @Transform(({ value }) =>
        typeof value === 'string' ? value.trim() || undefined : undefined,
    )
    public notMentionsUser?: string;

    @ApiPropertyOptional({
        description: 'Exclude messages of this author type',
        enum: ['user', 'bot', 'webhook'],
    })
    @IsOptional()
    @IsIn(['user', 'bot', 'webhook'])
    public notAuthorType?: 'user' | 'bot' | 'webhook';

    @ApiPropertyOptional({ description: 'Exclude pinned/unpinned messages' })
    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === 'true' || value === true)
    public notIsPinned?: boolean;

    @ApiPropertyOptional({
        description: 'Exclude messages with a file attachment',
    })
    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === 'true' || value === true)
    public notHasFile?: boolean;

    @ApiPropertyOptional({ description: 'Exclude messages with an embed' })
    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === 'true' || value === true)
    public notHasEmbed?: boolean;

    @ApiPropertyOptional({
        description: 'Exclude messages that contain a link',
    })
    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === 'true' || value === true)
    public notHasLink?: boolean;

    @ApiPropertyOptional({
        description: 'Exclude messages matching this exact phrase',
    })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    @Transform(({ value }) =>
        typeof value === 'string' ? value.trim() || undefined : undefined,
    )
    public notStrict?: string;
}

export class DmMessageSearchQueryDTO extends BaseMessageSearchQueryDTO {
    @ApiProperty({ description: 'The other user in the DM conversation' })
    @IsUserId()
    public userId!: string;
}

export class ChannelMessageSearchQueryDTO extends BaseMessageSearchQueryDTO {
    @ApiPropertyOptional({
        description: 'Filter pinned messages (channel only)',
    })
    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === 'true' || value === true)
    public isPinned?: boolean;

    @ApiPropertyOptional({
        description:
            'Search in specific channel(s) by ID (access validated server-side)',
        type: [String],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @MinLength(1, { each: true })
    @MaxLength(100, { each: true })
    @Transform(({ value }) => {
        if (value === undefined || value === null) return undefined;
        const arr = Array.isArray(value) ? value : [value];
        const cleaned = arr.filter(
            (v) => typeof v === 'string' && v.trim() !== '',
        );
        return cleaned.length > 0 ? cleaned : undefined;
    })
    public inChannel?: string[];

    @ApiPropertyOptional({
        description:
            'Search in all text channels belonging to these category IDs (access validated server-side)',
        type: [String],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @MinLength(1, { each: true })
    @MaxLength(100, { each: true })
    @Transform(({ value }) => {
        if (value === undefined || value === null) return undefined;
        const arr = Array.isArray(value) ? value : [value];
        const cleaned = arr.filter(
            (v) => typeof v === 'string' && v.trim() !== '',
        );
        return cleaned.length > 0 ? cleaned : undefined;
    })
    public inCategory?: string[];

    @ApiPropertyOptional({
        description:
            'Exclude text channels belonging to these category IDs from the search scope',
        type: [String],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @MinLength(1, { each: true })
    @MaxLength(100, { each: true })
    @Transform(({ value }) => {
        if (value === undefined || value === null) return undefined;
        const arr = Array.isArray(value) ? value : [value];
        const cleaned = arr.filter(
            (v) => typeof v === 'string' && v.trim() !== '',
        );
        return cleaned.length > 0 ? cleaned : undefined;
    })
    public notInCategory?: string[];
}
