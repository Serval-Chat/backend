import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsString } from 'class-validator';

export class UserWarningIssuedByDTO {
    @ApiProperty()
    public username!: string;
}

export class UserWarningResponseDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    public _id!: string;

    @ApiProperty()
    @IsMongoId()
    @IsString()
    public userId!: string;

    @ApiProperty()
    public message!: string;

    @ApiProperty({ type: UserWarningIssuedByDTO })
    public issuedBy!: UserWarningIssuedByDTO;

    @ApiProperty()
    public acknowledged!: boolean;

    @ApiPropertyOptional()
    public acknowledgedAt?: Date;

    @ApiProperty()
    public timestamp!: Date;
}
