import { ApiProperty } from '@nestjs/swagger';
import {
    IsString,
    Matches,
    IsOptional,
    ValidateIf,
    Length,
} from 'class-validator';

export class TotpSetupResponseDTO {
    @ApiProperty()
    public otpauthUri!: string;
}

export class TotpSetupConfirmRequestDTO {
    @ApiProperty({ description: '6 digit code from authenticator app' })
    @IsString()
    @Matches(/^\d{6}$/)
    public code!: string;
}

export class TotpVerifyRequestDTO {
    @ApiProperty()
    @IsString()
    public tempToken!: string;

    @ApiProperty({ required: false, description: '6 digit authenticator code' })
    @ValidateIf((o: TotpVerifyRequestDTO) => o.backupCode === undefined)
    @IsString()
    @Matches(/^\d{6}$/)
    @IsOptional()
    public code?: string;

    @ApiProperty({
        required: false,
        description: 'Backup code in XXXX-XXXX format',
    })
    @ValidateIf((o: TotpVerifyRequestDTO) => o.code === undefined)
    @IsString()
    @Length(9, 9)
    @Matches(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/i)
    @IsOptional()
    public backupCode?: string;
}

export class TotpSensitiveActionRequestDTO {
    @ApiProperty({ required: false })
    @ValidateIf(
        (o: TotpSensitiveActionRequestDTO) => o.backupCode === undefined,
    )
    @IsString()
    @Matches(/^\d{6}$/)
    @IsOptional()
    public code?: string;

    @ApiProperty({ required: false })
    @ValidateIf((o: TotpSensitiveActionRequestDTO) => o.code === undefined)
    @IsString()
    @Length(9, 9)
    @Matches(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/i)
    @IsOptional()
    public backupCode?: string;
}

export class TotpSetupConfirmResponseDTO {
    @ApiProperty({ type: [String] })
    public backupCodes!: string[];
}
