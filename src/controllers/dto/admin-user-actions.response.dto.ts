import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsString } from 'class-validator';
import { AdminBanHistoryItemDTO } from './types.dto';


export class AdminResetProfileResponseDTO {
    @ApiProperty()
    public message!: string;
    @ApiProperty()
    public fields!: string[];
}

export class AdminSoftDeleteUserResponseDTO {
    @ApiProperty()
    public message!: string;
    @ApiProperty()
    public anonymizedUsername!: string;
    @ApiProperty()
    public offlineFriends!: number;
}

export class AdminDeleteUserResponseDTO {
    @ApiProperty()
    public message!: string;
    @ApiProperty()
    public anonymizedUsername!: string;
}

export class AdminHardDeleteUserResponseDTO {
    @ApiProperty()
    public message!: string;
    @ApiProperty()
    public sentMessagesAnonymized!: number;
    @ApiProperty()
    public receivedMessagesAnonymized!: number;
    @ApiProperty()
    public offlineFriends!: number;
}

export class AdminUpdateUserPermissionsResponseDTO {
    @ApiProperty()
    public message!: string;
}

export class AdminBanUserResponseDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    public _id!: string;
    @ApiProperty()
    @IsMongoId()
    @IsString()
    public userId!: string;
    @ApiProperty()
    public reason!: string;
    @ApiProperty()
    @IsMongoId()
    @IsString()
    public issuedBy!: string;
    @ApiProperty()
    public expirationTimestamp!: Date;
    @ApiProperty()
    public active!: boolean;
    @ApiPropertyOptional({ type: [AdminBanHistoryItemDTO] })
    public history?: AdminBanHistoryItemDTO[];
}

export class AdminUnbanUserResponseDTO {
    @ApiProperty()
    public message!: string;
}

export class AdminWarnUserResponseDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    public _id!: string;
    @ApiProperty()
    @IsMongoId()
    @IsString()
    public userId!: string;
    @ApiProperty()
    @IsMongoId()
    @IsString()
    public issuedBy!: string;
    @ApiProperty()
    public message!: string;
    @ApiProperty()
    public timestamp!: Date;
    @ApiProperty()
    public acknowledged!: boolean;
    @ApiPropertyOptional()
    public acknowledgedAt?: Date;
}
