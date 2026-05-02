import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsString } from 'class-validator';

export class AdminServerOwnerDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    public _id!: string;
    @ApiProperty()
    public username!: string;
    @ApiProperty({ nullable: true })
    public displayName!: string | null;
    @ApiProperty({ nullable: true })
    public profilePicture!: string | null;
}

export class AdminServerBannerDTO {
    @ApiProperty({ enum: ['color', 'image', 'gif', 'gradient'] })
    public type!: 'color' | 'image' | 'gif' | 'gradient';
    @ApiProperty()
    public value!: string;
}

export class AdminServerListItemDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    public _id!: string;
    @ApiProperty()
    public name!: string;
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
    @ApiProperty({ default: false })
    public verificationRequested!: boolean;
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
