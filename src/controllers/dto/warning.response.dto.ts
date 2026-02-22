import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsString } from 'class-validator';

export class UserWarningIssuedByDTO {
    @ApiProperty()
    username!: string;
}

export class UserWarningResponseDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    _id!: string;

    @ApiProperty()
    @IsMongoId()
    @IsString()
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
