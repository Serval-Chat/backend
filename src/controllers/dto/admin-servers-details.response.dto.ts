import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdminServerOwnerDTO, AdminServerBannerDTO } from './admin-servers.response.dto';

export class AdminChannelShortDTO {
    @ApiProperty()
    public _id!: string;

    @ApiProperty()
    public name!: string;

    @ApiProperty({ enum: ['text', 'voice', 'link'] })
    public type!: 'text' | 'voice' | 'link';

    @ApiProperty()
    public position!: number;
}

export class AdminServerDetailsDTO {
    @ApiProperty()
    public _id!: string;

    @ApiProperty()
    public name!: string;

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

    @ApiProperty({ default: false })
    public verificationRequested!: boolean;
}
