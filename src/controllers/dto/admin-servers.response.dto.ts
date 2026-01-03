import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminServerOwnerDTO {
    @ApiProperty()
    _id!: string;
    @ApiProperty()
    username!: string;
    @ApiProperty({ nullable: true })
    displayName!: string | null;
    @ApiProperty({ nullable: true })
    profilePicture!: string | null;
}

export class AdminServerBannerDTO {
    @ApiProperty({ enum: ['color', 'image', 'gif', 'gradient'] })
    type!: 'color' | 'image' | 'gif' | 'gradient';
    @ApiProperty()
    value!: string;
}

export class AdminServerListItemDTO {
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
    createdAt!: Date;
    @ApiPropertyOptional()
    deletedAt?: Date;
    @ApiProperty({ type: AdminServerOwnerDTO, nullable: true })
    owner!: AdminServerOwnerDTO | null;
}

export type AdminServerListResponseDTO = AdminServerListItemDTO[];

export class AdminDeleteServerResponseDTO {
    @ApiProperty()
    message!: string;
}

export class AdminRestoreServerResponseDTO {
    @ApiProperty()
    message!: string;
}

