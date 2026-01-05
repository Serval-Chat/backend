import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminResetProfileResponseDTO {
    @ApiProperty()
    message!: string;
    @ApiProperty()
    fields!: string[];
}

export class AdminSoftDeleteUserResponseDTO {
    @ApiProperty()
    message!: string;
    @ApiProperty()
    anonymizedUsername!: string;
    @ApiProperty()
    offlineFriends!: number;
}

export class AdminDeleteUserResponseDTO {
    @ApiProperty()
    message!: string;
    @ApiProperty()
    anonymizedUsername!: string;
}

export class AdminHardDeleteUserResponseDTO {
    @ApiProperty()
    message!: string;
    @ApiProperty()
    sentMessagesAnonymized!: number;
    @ApiProperty()
    receivedMessagesAnonymized!: number;
    @ApiProperty()
    offlineFriends!: number;
}

export class AdminUpdateUserPermissionsResponseDTO {
    @ApiProperty()
    message!: string;
}

export class AdminBanUserResponseDTO {
    @ApiProperty()
    _id!: string;
    @ApiProperty()
    userId!: string;
    @ApiProperty()
    reason!: string;
    @ApiProperty()
    issuedBy!: string;
    @ApiProperty()
    expirationTimestamp!: Date;
    @ApiProperty()
    active!: boolean;
    @ApiPropertyOptional({ type: [Object] })
    history?: unknown[];
}

export class AdminUnbanUserResponseDTO {
    @ApiProperty()
    message!: string;
}

export class AdminWarnUserResponseDTO {
    @ApiProperty()
    _id!: string;
    @ApiProperty()
    userId!: string;
    @ApiProperty()
    issuedBy!: string;
    @ApiProperty()
    message!: string;
    @ApiProperty()
    timestamp!: Date;
    @ApiProperty()
    acknowledged!: boolean;
    @ApiPropertyOptional()
    acknowledgedAt?: Date;
}
