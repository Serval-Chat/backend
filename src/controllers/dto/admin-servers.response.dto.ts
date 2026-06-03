import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsString } from 'class-validator';

export class AdminServerOwnerDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    public id!: string;
    @ApiProperty()
    public username!: string;
    @ApiProperty({ nullable: true })
    public displayName!: string | null;
    @ApiProperty({ nullable: true })
    public profilePicture!: string | null;
}

export class AdminServerBannerDTO {
    @ApiProperty({ enum: ['color', 'image', 'gif'] })
    public type!: 'color' | 'image' | 'gif';
    @ApiProperty()
    public value!: string;
}

export class AdminServerListItemDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
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
    @IsMongoId()
    @IsString()
    public ownerId!: string;
    @ApiProperty()
    public memberCount!: number;
    @ApiProperty()
    public createdAt!: Date;
    @ApiPropertyOptional()
    public deletedAt?: Date;
    @ApiProperty({ type: AdminServerOwnerDTO, nullable: true })
    public owner!: AdminServerOwnerDTO | null;
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
    @ApiPropertyOptional()
    public realMessageCount?: number;
    @ApiPropertyOptional()
    public weightScore?: number;
}

export type AdminServerListResponseDTO = AdminServerListItemDTO[];

export class AdminDeleteServerResponseDTO {
    @ApiProperty()
    public message!: string;
}

export class AdminRestoreServerResponseDTO {
    @ApiProperty()
    public message!: string;
}
