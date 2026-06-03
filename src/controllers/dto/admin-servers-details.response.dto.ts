import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    AdminServerOwnerDTO,
    AdminServerBannerDTO,
} from './admin-servers.response.dto';

export class AdminChannelShortDTO {
    @ApiProperty()
    public id!: string;

    @ApiProperty()
    public name!: string;

    @ApiPropertyOptional()
    public description?: string;

    @ApiProperty({ enum: ['text', 'voice', 'link'] })
    public type!: 'text' | 'voice' | 'link';

    @ApiProperty()
    public position!: number;
}

export class AdminServerDetailsDTO {
    @ApiProperty()
    public id!: string;

    @ApiProperty()
    public name!: string;

    @ApiPropertyOptional()
    public description?: string;

    @ApiProperty({ nullable: true })
    public icon!: string | null;

    @ApiPropertyOptional({ type: AdminServerBannerDTO })
    public banner?: AdminServerBannerDTO;

    @ApiProperty()
    public ownerId!: string;

    @ApiProperty()
    public memberCount!: number;

    @ApiProperty()
    public messageVolume!: number;

    @ApiProperty()
    public createdAt!: Date;

    @ApiPropertyOptional()
    public deletedAt?: Date;

    @ApiProperty({ type: AdminServerOwnerDTO, nullable: true })
    public owner!: AdminServerOwnerDTO | null;

    @ApiProperty({ type: [AdminChannelShortDTO] })
    public channels!: AdminChannelShortDTO[];

    @ApiProperty()
    public recentBanCount!: number;

    @ApiProperty()
    public recentKickCount!: number;

    @ApiProperty({ default: false })
    public verified!: boolean;

    @ApiPropertyOptional()
    public verificationScore?: number;

    @ApiPropertyOptional()
    public verificationEligible?: boolean;

    @ApiPropertyOptional()
    public verificationLastComputedAt?: Date;

    @ApiPropertyOptional({ type: [String] })
    public verificationFailureReasons?: string[];

    @ApiPropertyOptional({ enum: ['verified', 'unverified', null] })
    public verificationOverride?: 'verified' | 'unverified' | null;

    @ApiProperty({ default: false })
    public verificationRequested!: boolean;

    @ApiProperty({ default: false })
    public discoveryEnabled!: boolean;
}

export class AdminSimpleMessageResponseDTO {
    @ApiProperty()
    public message!: string;
}

export class AdminServerVerificationOverrideResponseDTO {
    @ApiProperty()
    public verified!: boolean;

    @ApiProperty({ required: false, nullable: true })
    public override!: 'verified' | 'unverified' | null;
}

export class AdminServerVerifyResponseDTO {
    @ApiProperty()
    public verified!: boolean;
}
