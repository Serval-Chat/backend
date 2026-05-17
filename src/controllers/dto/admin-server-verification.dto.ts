import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class AdminServerVerificationStatsDTO {
    @ApiProperty()
    public p80Threshold!: number;

    @ApiProperty()
    public p65Threshold!: number;

    @ApiProperty()
    public p95T!: number;

    @ApiProperty()
    public p95M!: number;

    @ApiProperty()
    public p95B!: number;

    @ApiProperty()
    public eligibleServerCount!: number;

    @ApiProperty()
    public verifiedServerCount!: number;

    @ApiProperty({ nullable: true })
    public lastRunAt!: Date | null;
}

export class AdminServerVerificationOverrideRequestDTO {
    @ApiPropertyOptional({ enum: ['verified', 'unverified', null] })
    @IsOptional()
    @IsIn(['verified', 'unverified', null])
    public override?: 'verified' | 'unverified' | null;
}
