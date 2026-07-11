import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsString } from 'class-validator';

export class AdminBotOwnerDTO {
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

export class AdminBotListItemDTO {
    @ApiProperty()
    public id!: string;
    @ApiProperty()
    public clientId!: string;
    @ApiProperty()
    public username!: string;
    @ApiProperty({ nullable: true })
    public displayName!: string | null;
    @ApiProperty({ nullable: true })
    public profilePicture!: string | null;
    @ApiProperty()
    @IsMongoId()
    @IsString()
    public ownerId!: string;
    @ApiProperty({ type: AdminBotOwnerDTO, nullable: true })
    public owner!: AdminBotOwnerDTO | null;
    @ApiProperty()
    public serverCount!: number;
    @ApiProperty()
    public createdAt!: Date;
    @ApiProperty()
    public verified!: boolean;
    @ApiProperty({ nullable: true, enum: ['verified', 'unverified', null] })
    public verificationOverride!: 'verified' | 'unverified' | null;
    @ApiProperty()
    public verificationRequested!: boolean;
}

export type AdminBotListResponseDTO = AdminBotListItemDTO[];

export class AdminBotVerifyResponseDTO {
    @ApiProperty()
    public verified!: boolean;
}

export class AdminBotVerificationOverrideResponseDTO {
    @ApiProperty()
    public verified!: boolean;
    @ApiProperty({ nullable: true, enum: ['verified', 'unverified', null] })
    public override!: 'verified' | 'unverified' | null;
}
