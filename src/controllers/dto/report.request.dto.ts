import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsEnum,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    MinLength,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsSnowflakeId } from '@/validation/schemas/common';
import type {
    ReportReason,
    ReportStatus,
    ReportTargetType,
} from '@/models/Report';

export class CreateReportRequestDTO {
    @ApiProperty({ enum: ['message', 'user'] })
    @IsEnum(['message', 'user'])
    public targetType!: ReportTargetType;

    @ApiProperty()
    @IsString()
    @IsSnowflakeId()
    public targetId!: string;

    @ApiProperty({ maxLength: 64 })
    @IsString()
    @Matches(/^[a-z0-9][a-z0-9_-]{0,63}$/)
    public reason!: ReportReason;

    @ApiPropertyOptional({ maxLength: 64 })
    @IsOptional()
    @IsString()
    @Matches(/^[a-z0-9][a-z0-9_-]{0,63}$/)
    public subReason?: string;

    @ApiPropertyOptional({ maxLength: 1000 })
    @IsOptional()
    @IsString()
    @MaxLength(1000)
    public details?: string;
}

export class ReportReasonOptionDTO {
    @ApiPropertyOptional({ maxLength: 64 })
    @IsOptional()
    @IsString()
    @Matches(/^[a-z0-9][a-z0-9_-]{0,63}$/)
    public id?: string;

    @ApiProperty({ enum: ['message', 'user'] })
    @IsEnum(['message', 'user'])
    public targetType!: ReportTargetType;

    @ApiProperty({ maxLength: 80 })
    @IsString()
    @MinLength(1)
    @MaxLength(80)
    public label!: string;

    @ApiProperty()
    @IsBoolean()
    public enabled!: boolean;

    @ApiPropertyOptional({ type: () => [ReportSubcategoryOptionDTO] })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(50)
    @ValidateNested({ each: true })
    @Type(() => ReportSubcategoryOptionDTO)
    public subcategories?: ReportSubcategoryOptionDTO[];
}

export class ReportSubcategoryOptionDTO {
    @ApiPropertyOptional({ maxLength: 64 })
    @IsOptional()
    @IsString()
    @Matches(/^[a-z0-9][a-z0-9_-]{0,63}$/)
    public id?: string;

    @ApiProperty({ maxLength: 80 })
    @IsString()
    @MinLength(1)
    @MaxLength(80)
    public label!: string;

    @ApiProperty()
    @IsBoolean()
    public enabled!: boolean;
}

export class UpdateReportReasonOptionsRequestDTO {
    @ApiProperty({ type: [ReportReasonOptionDTO], maxItems: 50 })
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(50)
    @ValidateNested({ each: true })
    @Type(() => ReportReasonOptionDTO)
    public options!: ReportReasonOptionDTO[];

    @ApiPropertyOptional({ type: [String], maxItems: 50 })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(50)
    @IsString({ each: true })
    @Matches(/^[a-z0-9][a-z0-9_-]{0,63}$/, { each: true })
    public deleteReasonIds?: string[];

    @ApiPropertyOptional({ type: [String], maxItems: 2500 })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(2500)
    @IsString({ each: true })
    @Matches(/^[a-z0-9][a-z0-9_-]{0,63}$/, { each: true })
    public deleteSubcategoryIds?: string[];
}

export class UpdateReportRequestDTO {
    @ApiProperty({ enum: ['open', 'reviewing', 'resolved', 'dismissed'] })
    @IsEnum(['open', 'reviewing', 'resolved', 'dismissed'])
    public status!: ReportStatus;

    @ApiPropertyOptional({ maxLength: 2000 })
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    public internalNote?: string;
}
