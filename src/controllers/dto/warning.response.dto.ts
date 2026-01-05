import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserWarningIssuedByDTO {
    @ApiProperty()
    username!: string;
}

export class UserWarningResponseDTO {
    @ApiProperty()
    _id!: string;

    @ApiProperty()
    userId!: string;

    @ApiProperty()
    message!: string;

    @ApiProperty({ type: UserWarningIssuedByDTO })
    issuedBy!: UserWarningIssuedByDTO;

    @ApiProperty()
    acknowledged!: boolean;

    @ApiPropertyOptional()
    acknowledgedAt?: Date;

    @ApiProperty()
    timestamp!: Date;
}
