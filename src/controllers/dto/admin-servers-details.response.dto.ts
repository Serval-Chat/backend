import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdminServerOwnerDTO, AdminServerBannerDTO } from './admin-servers.response.dto';

export class AdminChannelShortDTO {
    @ApiProperty()
    _id!: string;

    @ApiProperty()
    name!: string;

    @ApiProperty({ enum: ['text', 'voice', 'link'] })
    type!: 'text' | 'voice' | 'link';

    @ApiProperty()
    position!: number;
}

export class AdminServerDetailsDTO {
    @ApiProperty()
    _id!: string;

    @ApiProperty()
    name!: string;

    @ApiProperty({ nullable: true })
    icon!: string | null;

    @ApiPropertyOptional({ type: AdminServerBannerDTO })
    banner?: AdminServerBannerDTO;

    @ApiProperty()
    ownerId!: string;

    @ApiProperty()
    memberCount!: number;

    @ApiProperty()
    messageVolume!: number;

    @ApiProperty()
    createdAt!: Date;

    @ApiPropertyOptional()
    deletedAt?: Date;

    @ApiProperty({ type: AdminServerOwnerDTO, nullable: true })
    owner!: AdminServerOwnerDTO | null;

    @ApiProperty({ type: [AdminChannelShortDTO] })
    channels!: AdminChannelShortDTO[];

    @ApiProperty()
    recentBanCount!: number;

    @ApiProperty()
    recentKickCount!: number;

    @ApiProperty({ default: false })
    verified!: boolean;

    @ApiProperty({ default: false })
    verificationRequested!: boolean;
}
