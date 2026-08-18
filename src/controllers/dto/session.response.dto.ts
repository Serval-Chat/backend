import { ApiProperty } from '@nestjs/swagger';

export class SessionEntryDTO {
    @ApiProperty()
    public id!: string;

    @ApiProperty()
    public userAgent!: string;

    @ApiProperty()
    public ip!: string;

    @ApiProperty({ required: false })
    public location?: string;

    @ApiProperty({ required: false, enum: ['vpn', 'datacenter'] })
    public ipRisk?: 'vpn' | 'datacenter';

    @ApiProperty()
    public createdAt!: Date;

    @ApiProperty()
    public lastSeenAt!: Date;

    @ApiProperty()
    public expiresAt!: Date;

    @ApiProperty()
    public isCurrent!: boolean;
}

export class SessionListResponseDTO {
    @ApiProperty({ type: [SessionEntryDTO] })
    public sessions!: SessionEntryDTO[];
}

export class RevokeSessionsResponseDTO {
    @ApiProperty()
    public message!: string;

    @ApiProperty()
    public revokedCount!: number;
}

export class UpdateSessionIpResponseDTO {
    @ApiProperty()
    public message!: string;

    @ApiProperty()
    public ip!: string;
}
